import { GoogleGenerativeAI } from '@google/generative-ai'
import { systemInstruction } from '../config/systemInstruction'

export async function askTutor(messages, question) {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key) throw new Error('Configura VITE_GEMINI_API_KEY en .env.local')
  const modelName = import.meta.env.VITE_GEMINI_MODEL?.trim() || 'gemini-3-flash-preview'
  const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: modelName, systemInstruction })
  const history = []
  // Only completed user/model pairs belong in Gemini's alternating history.
  for (let i = 0; i < messages.length - 1; i++) {
    if (messages[i].role === 'user' && messages[i + 1].role === 'model') {
      history.push({ role: 'user', parts: [{ text: messages[i].content }] })
      history.push({ role: 'model', parts: [{ text: messages[i + 1].content }] })
      i++
    }
  }
  const result = await model.startChat({ history }).sendMessage(question)
  const answer = result.response.text()?.trim()
  if (!answer) throw new Error('Respuesta vacía de Gemini')
  return answer
}
