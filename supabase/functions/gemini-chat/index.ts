import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_REQUEST_BYTES = 12 * 1024 * 1024
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

async function readLimited(response: Response | Request, maximum: number): Promise<Uint8Array> {
  const declared = response.headers.get('content-length')
  if (declared && Number(declared) > maximum) throw new RequestError('요청 또는 사진 크기가 너무 큽니다.', 413)
  const reader = response.body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maximum) {
        await reader.cancel()
        throw new RequestError('요청 또는 사진 크기가 너무 큽니다.', 413)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

async function requireApprovedUser(req: Request) {
  const authorization = req.headers.get('authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(authorization)) throw new RequestError('로그인이 필요합니다.', 401)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) throw new RequestError('인증 서비스 설정 오류입니다.', 503)
  const headers = { Authorization: authorization, apikey: anonKey }
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers, redirect: 'error', signal: AbortSignal.timeout(6000),
  })
  if (!authResponse.ok) throw new RequestError('로그인을 다시 해주세요.', 401)
  const user = await authResponse.json()
  if (!user?.id || user.is_anonymous === true) throw new RequestError('로그인이 필요합니다.', 401)
  const profileUrl = new URL(`${supabaseUrl}/rest/v1/user_profiles`)
  profileUrl.searchParams.set('select', 'is_approved')
  profileUrl.searchParams.set('id', `eq.${user.id}`)
  const profileResponse = await fetch(profileUrl, {
    headers, redirect: 'error', signal: AbortSignal.timeout(6000),
  })
  if (!profileResponse.ok) throw new RequestError('승인 상태를 확인할 수 없습니다.', 403)
  const profiles = await profileResponse.json()
  if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].is_approved !== true) {
    throw new RequestError('관리자 승인 후 이용할 수 있습니다.', 403)
  }
  return { supabaseUrl, headers }
}

const CHAT_SYSTEM_INSTRUCTION = `당신은 제주발전본부 발전제어설비 계측제어 정비 전문가입니다.

답변 원칙:
1. 첫 문장부터 결론, 판단 또는 사용자가 해야 할 행동을 바로 제시합니다. 인사, 감탄, 공감, 질문 재진술 같은 서두를 붙이지 않습니다.
2. "네", "알겠습니다", "좋은 질문입니다", "도와드리겠습니다", "문의하신 내용은"처럼 답변 없이 말문만 여는 표현을 사용하지 않습니다.
3. "그거", "그 설비", "그 원인", "그러면" 같은 후속질문은 직전 대화의 사용자·모델 메시지를 바탕으로 대상을 이어받습니다. 대상이 둘 이상이라 확정할 수 없을 때만 짧게 되묻습니다.
4. 근거 우선순위는 (1) 현재 요청에 첨부된 웹앱 자료, (2) 대화 이력, (3) 일반적인 계측제어 지식입니다. 웹앱 자료와 일반 지식을 섞어 사실처럼 단정하지 않습니다.
5. 제공되지 않은 Tag, 모델, 범위, 버튼명, 메뉴명, 설정값, 점검일자, 고장코드, 정비이력을 만들어내지 않습니다. 모델별 절차를 확정할 자료가 없으면 필요한 정확한 모델명 또는 매뉴얼을 한 문장으로 요청합니다.
6. 조작, 설정, 교정, 캘리브레이션처럼 순서가 핵심인 질문에는 설명보다 작업 흐름을 먼저 제시합니다. 아래 형식을 정확히 사용하고, [FLOW]와 [/FLOW] 사이에는 한 줄에 한 단계씩 3~8개의 짧은 행동만 씁니다. 단계 문장 안에는 화살표를 넣지 않습니다.
[FLOW]
안전조건 확인
초기 메뉴 진입
설정값 입력
동작 확인
[/FLOW]
7. 흐름도는 실제로 순차 수행하는 질문에만 사용합니다. 확인되지 않은 조작 순서를 채우지 말고, 모델이 불명확하면 모델 확인 요청까지만 답합니다.
8. 고장·정비 질문은 가능하면 "판단 → 가능 원인 → 확인 순서 → 조치" 순서로 현장에서 바로 쓸 수 있게 답합니다. 원인은 가능성이 높은 순서로 정리합니다.
9. 설비 고유값은 제공된 표기를 그대로 유지합니다. 사용자가 원하지 않으면 지나치게 길거나 이론적인 설명은 피합니다.
10. 전원·압력·가스·고온부 작업은 차단, 무압 확인, LOTO, 작업허가 등 필요한 안전조건을 짧게 안내합니다. 운전 중 임의 우회나 보호기능 무력화를 지시하지 않습니다.
11. 기본 답변은 자연스러운 한국어로 간결하게 작성하고, 흐름도 뒤에는 꼭 필요한 주의사항이나 확인값만 덧붙입니다.`

const OCR_SYSTEM_INSTRUCTION = `당신은 발전소 계측제어 설비의 명판과 디스플레이를 판독하는 정비 전문가입니다.
제공된 사진을 분석해 아래 필드만 가진 유효한 JSON 객체 하나를 출력하세요.
tag_no, name, model, range, status, action_guide
사진에서 확인할 수 없는 값은 빈 문자열로 두고 추측하지 마세요. 마크다운 코드블록이나 추가 설명을 출력하지 마세요.`

type ChatMessage = { role: 'user' | 'model'; text: string }

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  const messages: ChatMessage[] = []

  for (const item of value.slice(-12)) {
    if (!item || typeof item !== 'object') continue
    const role = (item as Record<string, unknown>).role
    const rawText = (item as Record<string, unknown>).text
    if ((role !== 'user' && role !== 'model') || typeof rawText !== 'string') continue
    const text = rawText.trim().slice(0, 2500)
    if (!text) continue

    const previous = messages[messages.length - 1]
    if (previous?.role === role) previous.text = `${previous.text}\n${text}`.slice(0, 4000)
    else messages.push({ role, text })
  }

  return messages
}

function responseWithText(text: string, status = 200) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text }] } }]
  }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function addImagePart(parts: Array<Record<string, unknown>>, photosToSend: unknown,
  auth: { supabaseUrl: string; headers: Record<string, string> }) {
  if (!Array.isArray(photosToSend) || photosToSend.length === 0) return
  const rawImage = photosToSend[0]
  if (typeof rawImage !== 'string') throw new RequestError('사진 형식이 올바르지 않습니다.', 400)

  if (rawImage.startsWith('data:')) {
    const matches = rawImage.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/)
    if (!matches || matches[2].length % 4 !== 0) throw new RequestError('지원하지 않는 사진 형식입니다.', 400)
    if (matches[2].length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw new RequestError('사진 크기가 너무 큽니다.', 413)
    try { atob(matches[2]) } catch { throw new RequestError('사진 데이터가 올바르지 않습니다.', 400) }
    parts.push({ inlineData: { mimeType: matches[1], data: matches[2] } })
    return
  }

  let source: URL
  try { source = new URL(rawImage) } catch { throw new RequestError('사진 URL이 올바르지 않습니다.', 400) }
  const project = new URL(auth.supabaseUrl)
  const match = source.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/instrument-photos\/(.+)$/)
  if (source.protocol !== 'https:' || source.origin !== project.origin || source.username || source.password || !match) {
    throw new RequestError('이 프로젝트의 설비 사진만 사용할 수 있습니다.', 400)
  }
  let objectPath: string
  try { objectPath = decodeURIComponent(match[1]) } catch { throw new RequestError('사진 경로가 올바르지 않습니다.', 400) }
  if (objectPath.includes('\\') || objectPath.includes('\0') || objectPath.split('/').some(part => part === '.' || part === '..' || !part)) {
    throw new RequestError('사진 경로가 올바르지 않습니다.', 400)
  }
  // Never fetch the caller's URL or signed token: enforce Storage RLS with their JWT.
  const downloadUrl = `${project.origin}/storage/v1/object/authenticated/instrument-photos/${match[1]}`
  const imageResponse = await fetch(downloadUrl, {
    headers: auth.headers, redirect: 'error', signal: AbortSignal.timeout(6000),
  })
  if (!imageResponse.ok) throw new RequestError('사진을 읽을 권한이 없거나 사진이 없습니다.', 403)
  const mimeType = (imageResponse.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  if (!IMAGE_TYPES.has(mimeType)) throw new RequestError('지원하지 않는 사진 형식입니다.', 400)
  const imageBytes = await readLimited(imageResponse, MAX_IMAGE_BYTES)
  parts.push({ inlineData: { mimeType, data: base64Encode(imageBytes) } })
}

export async function handler(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return responseWithText('POST 요청만 가능합니다.', 405)

  try {
    const auth = await requireApprovedUser(req)
    let body
    try { body = JSON.parse(new TextDecoder().decode(await readLimited(req, MAX_REQUEST_BYTES))) }
    catch (error) {
      if (error instanceof RequestError) throw error
      throw new RequestError('요청 JSON이 올바르지 않습니다.', 400)
    }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 6000) : ''
    const extraContext = typeof body?.extraContext === 'string' ? body.extraContext.trim().slice(0, 16000) : ''
    const mode = body?.mode === 'ocr_tag' ? 'ocr_tag' : 'chat'
    const apiKey = Deno.env.get('GEMINI_API_KEY')

    if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')
    if (mode === 'chat' && !prompt) return responseWithText('질문을 입력해 주세요.', 400)

    const currentParts: Array<Record<string, unknown>> = []
    if (mode === 'ocr_tag') {
      currentParts.push({ text: '첨부된 설비 사진의 명판과 디스플레이 상태를 분석하세요.' })
    } else {
      const contextText = extraContext
        ? `[웹앱에서 선별한 참고 자료]\n${extraContext}\n\n[현재 질문]\n${prompt}`
        : `[현재 질문]\n${prompt}`
      currentParts.push({ text: contextText })
    }
    await addImagePart(currentParts, body?.photosToSend, auth)

    const history = mode === 'chat' ? sanitizeHistory(body?.history) : []
    const contents = [
      ...history.map(message => ({ role: message.role, parts: [{ text: message.text }] })),
      { role: 'user', parts: currentParts },
    ]

    const requestPayload: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: mode === 'ocr_tag' ? OCR_SYSTEM_INSTRUCTION : CHAT_SYSTEM_INSTRUCTION }]
      },
      contents,
      generationConfig: {
        maxOutputTokens: mode === 'ocr_tag' ? 1800 : 3072,
        temperature: mode === 'ocr_tag' ? 0.1 : 0.25,
        topP: 0.9,
        ...(mode === 'ocr_tag' ? { responseMimeType: 'application/json' } : {}),
      }
    }

    const models = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
    let geminiResponse: Response | null = null
    let responseJson: Record<string, unknown> | null = null

    for (let index = 0; index < models.length; index += 1) {
      geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${models[index]}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(30000),
        }
      )
      responseJson = await geminiResponse.json()
      if (geminiResponse.ok) break

      const retryable = geminiResponse.status === 404 || geminiResponse.status === 429 || geminiResponse.status >= 500
      if (!retryable || index === models.length - 1) break
    }

    if (!geminiResponse?.ok || !responseJson) {
      console.error('Gemini API 오류', geminiResponse?.status)
      return responseWithText('⚠️ AI 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.')
    }

    return new Response(JSON.stringify(responseJson), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    if (error instanceof RequestError) return responseWithText(error.message, error.status)
    console.error('gemini-chat 처리 오류', error instanceof Error ? error.name : 'UnknownError')
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? '⚠️ AI 응답 시간이 초과되었습니다. 질문을 조금 줄여 다시 시도해 주세요.'
      : '⚠️ AI 요청 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
    return responseWithText(message, 500)
  }
}

serve(handler)
