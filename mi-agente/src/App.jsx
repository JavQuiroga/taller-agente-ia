import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { askTutor } from './lib/gemini'
import { saveConversation } from './lib/supabase'
import './App.css'

const STORE = 'nexus-tutor-chats-v1'
const ACTIVE = 'nexus-tutor-active-v1'
const freshChat = () => ({ id: crypto.randomUUID(), title: 'Nuevo chat', createdAt: new Date().toISOString(), messages: [] })
function initialChats() {
  try {
    const chats = JSON.parse(localStorage.getItem(STORE))
    if (Array.isArray(chats) && chats.length && chats.every((c) => c.id && Array.isArray(c.messages))) return chats
  } catch { /* Storage may be unavailable. */ }
  return [freshChat()]
}

export default function App() {
  const [chats, setChats] = useState(initialChats)
  const [activeId, setActiveId] = useState(() => { try { return localStorage.getItem(ACTIVE) } catch { return null } })
  const [draft, setDraft] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [notice, setNotice] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [listening, setListening] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const busyRef = useRef(false)
  const speechRef = useRef(null)
  const bottomRef = useRef(null)
  const chat = chats.find((c) => c.id === activeId) || chats[0]
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(chats)) } catch { console.warn('No se pudo guardar el historial local.') } }, [chats])
  useEffect(() => { try { localStorage.setItem(ACTIVE, chat.id) } catch { /* Storage disabled. */ } }, [chat.id])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chat.id, chat.messages.length, busyId])
  useEffect(() => () => speechRef.current?.abort(), [])

  const changeChat = (id, change) => setChats((current) => current.map((c) => c.id === id ? change(c) : c))
  function addChat() {
    const next = freshChat()
    setChats((current) => [next, ...current])
    setActiveId(next.id)
    setDraft('')
    setNotice('')
    setMenuOpen(false)
  }
  function clearChats() {
    if (!window.confirm('¿Borrar todos los chats locales?')) return
    speechRef.current?.abort()
    const next = freshChat()
    setChats([next])
    setActiveId(next.id)
    setDraft('')
    setNotice('')
    try { localStorage.removeItem(STORE); localStorage.removeItem(ACTIVE) } catch { /* State has been cleared. */ }
  }
  async function send(event) {
    event?.preventDefault()
    const question = draft.trim()
    if (!question || busyRef.current) return
    const id = chat.id
    const history = chat.messages
    busyRef.current = true
    setBusyId(id)
    setDraft('')
    setNotice('')
    changeChat(id, (c) => ({ ...c, title: c.messages.length ? c.title : question.slice(0, 42) + (question.length > 42 ? '…' : ''), messages: [...c.messages, { id: crypto.randomUUID(), role: 'user', content: question }] }))
    try {
      const answer = await askTutor(history, question)
      changeChat(id, (c) => ({ ...c, messages: [...c.messages, { id: crypto.randomUUID(), role: 'model', content: answer }] }))
      try { await saveConversation(question, answer) }
      catch (error) { console.warn('No se pudo guardar en Supabase:', error?.message || error); setNotice('La respuesta llegó, pero no se pudo guardar en la nube.') }
    } catch (error) {
      console.error('Error de Gemini:', error?.message || error)
      setNotice('No se pudo responder. Tu pregunta se conservó; vuelve a enviarla para reintentar.')
      setDraft(question)
    } finally { busyRef.current = false; setBusyId(null) }
  }
  async function copy(message) {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedId(message.id)
      setTimeout(() => setCopiedId((id) => id === message.id ? null : id), 2000)
    } catch { setNotice('No se pudo copiar la respuesta.') }
  }
  function microphone() {
    if (!SpeechRecognition) { setNotice('Este navegador no admite reconocimiento de voz.'); return }
    if (listening) { speechRef.current?.stop(); return }
    const speech = new SpeechRecognition()
    speechRef.current = speech
    speech.lang = 'es-CO'
    speech.onresult = (event) => setDraft((current) => [current.trim(), Array.from(event.results).map((r) => r[0].transcript).join(' ')].filter(Boolean).join(' '))
    speech.onerror = (event) => { if (event.error !== 'aborted') setNotice('No se pudo reconocer la voz. Inténtalo otra vez.') }
    speech.onend = () => { setListening(false); speechRef.current = null }
    try { speech.start(); setListening(true); setNotice('') } catch { setListening(false); setNotice('No se pudo iniciar el micrófono.') }
  }

  return <div className="app">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><span className="brand-symbol">N</span><div><strong>Nexus Tutor</strong><small>Tu espacio para aprender</small></div></div>
      <button className="new-chat" onClick={addChat}>＋ Nuevo chat</button>
      <div className="sidebar-label">CONVERSACIONES</div>
      <nav className="chat-list" aria-label="Chats anteriores">{chats.map((c) => <button key={c.id} className={`chat-item ${c.id === chat.id ? 'selected' : ''}`} onClick={() => { setActiveId(c.id); setDraft(''); setNotice(''); setMenuOpen(false) }}><span>◇</span><span>{c.title}</span></button>)}</nav>
      <button className="clear" onClick={clearChats}>Borrar sesión</button>
    </aside>
    {menuOpen && <button className="backdrop" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)} />}
    <main className="main">
      <header className="topbar"><button className="menu" aria-label="Abrir chats" onClick={() => setMenuOpen(true)}>☰</button><div><strong>Nexus Tutor</strong><small>Asistente educativo</small></div><span className="online" /></header>
      <section className="conversation" aria-label="Conversación"><div className="conversation-inner">
        {!chat.messages.length && <div className="empty"><div className="empty-symbol">✦</div><h1>Nexus Tutor</h1><p>¿Qué quieres aprender hoy?</p><small>Pregunta, explora y construye tus ideas paso a paso.</small></div>}
        {chat.messages.map((m) => <article className={`message ${m.role === 'user' ? 'user' : 'tutor'}`} key={m.id}><div className="avatar">{m.role === 'user' ? 'Tú' : 'N'}</div><div className="message-content"><strong>{m.role === 'user' ? 'Tú' : 'Nexus Tutor'}</strong>{m.role === 'user' ? <div className="plain">{m.content}</div> : <><div className="markdown"><ReactMarkdown>{m.content}</ReactMarkdown></div><button className="copy" onClick={() => copy(m)}>{copiedId === m.id ? 'Copiado' : 'Copiar'}</button></>}</div></article>)}
        {busyId === chat.id && <div className="thinking" role="status"><span>● ● ●</span> Nexus Tutor está pensando…</div>}
        <div ref={bottomRef} />
      </div></section>
      <div className="composer-area">{notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso">×</button></div>}<form className="composer" onSubmit={send}><textarea aria-label="Tu pregunta" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }} placeholder="Escribe tu pregunta aquí…" rows="2" /><div className="actions"><button type="button" className={`mic ${listening ? 'listening' : ''}`} onClick={microphone} disabled={!SpeechRecognition} title={SpeechRecognition ? 'Usar micrófono' : 'Reconocimiento de voz no disponible'} aria-label={listening ? 'Detener escucha' : 'Usar micrófono'}>🎙</button><span>Enter para enviar · Shift + Enter para nueva línea</span><button className="send" type="submit" disabled={!draft.trim() || !!busyId}>Enviar ↑</button></div></form><p className="hint">Nexus Tutor puede equivocarse. Verifica la información importante.</p></div>
    </main>
  </div>
}
