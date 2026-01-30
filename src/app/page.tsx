'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface Message {
  role: 'user' | 'assistant'
  content: string
  sources?: { title: string; content: string }[]
  suggestions?: string[]
}

interface Meeting {
  id: string
  title: string
  createdAt: string
}

interface Project {
  id: string
  name: string
  color: string
}

interface ChatSession {
  id: string
  title: string
  createdAt: string
  lastMessageAt: string
}

interface Bookmark {
  id: string
  question: string
  answer: string
  sources?: { title: string; content: string }[]
  note?: string
  createdAt: string
}

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [currentSessionId, setCurrentSessionId] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'history' | 'bookmarks' | 'filter'>('history')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchMeetings()
      fetchProjects()
      fetchChatSessions()
      fetchBookmarks()
    }
  }, [session])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings')
      if (res.status === 401) return
      const data = await res.json()
      if (data.meetings) setMeetings(data.meetings)
    } catch (e) {
      console.error('Failed to fetch meetings:', e)
    }
  }

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.status === 401) return
      const data = await res.json()
      if (data.projects) setProjects(data.projects)
    } catch (e) {
      console.error('Failed to fetch projects:', e)
    }
  }

  const fetchChatSessions = async () => {
    try {
      const res = await fetch('/api/sessions')
      if (res.status === 401) return
      const data = await res.json()
      if (data.sessions) setChatSessions(data.sessions)
    } catch (e) {
      console.error('Failed to fetch sessions:', e)
    }
  }

  const fetchBookmarks = async () => {
    try {
      const res = await fetch('/api/bookmarks')
      if (res.status === 401) return
      const data = await res.json()
      if (data.bookmarks) setBookmarks(data.bookmarks)
    } catch (e) {
      console.error('Failed to fetch bookmarks:', e)
    }
  }

  const addBookmark = async (question: string, answer: string, sources?: any[]) => {
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer, sources })
      })
      if (res.ok) {
        fetchBookmarks()
        alert('저장되었습니다!')
      }
    } catch (e) {
      console.error('Failed to add bookmark:', e)
    }
  }

  const deleteBookmark = async (id: string) => {
    if (!confirm('이 북마크를 삭제할까요?')) return
    try {
      await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' })
      setBookmarks(prev => prev.filter(b => b.id !== id))
    } catch (e) {
      console.error('Failed to delete bookmark:', e)
    }
  }

  const loadBookmark = (bookmark: Bookmark) => {
    setMessages([
      { role: 'user', content: bookmark.question },
      { role: 'assistant', content: bookmark.answer, sources: bookmark.sources }
    ])
    setCurrentSessionId('')
    setSidebarOpen(false)
  }

  const exportChat = async (format: 'markdown' | 'json' = 'markdown') => {
    if (!currentSessionId) {
      alert('저장된 대화만 내보낼 수 있습니다.')
      return
    }

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, format })
      })

      if (!res.ok) throw new Error('Export failed')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `대화_${new Date().toISOString().slice(0, 10)}.${format === 'markdown' ? 'md' : 'json'}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e) {
      console.error('Export error:', e)
      alert('내보내기에 실패했습니다.')
    }
  }

  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages || [])
      setCurrentSessionId(sessionId)
      setSidebarOpen(false)
    } catch (e) {
      console.error('Failed to load session:', e)
    }
  }

  const startNewChat = () => {
    setMessages([])
    setCurrentSessionId('')
    setSelectedMeeting('')
    setSelectedProject('')
  }

  const deleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('이 대화를 삭제할까요?')) return
    
    try {
      await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' })
      setChatSessions(prev => prev.filter(s => s.id !== sessionId))
      if (currentSessionId === sessionId) {
        startNewChat()
      }
    } catch (e) {
      console.error('Failed to delete session:', e)
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          meetingId: selectedMeeting || undefined,
          projectId: selectedProject || undefined,
          sessionId: currentSessionId || undefined
        }),
      })

      if (res.status === 401) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '로그인이 필요합니다. 다시 로그인해 주세요.'
        }])
        setIsLoading(false)
        return
      }

      if (res.status === 403) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '해당 회의에 접근 권한이 없습니다.'
        }])
        setIsLoading(false)
        return
      }

      const data = await res.json()

      // 새 세션이 생성된 경우 ID 저장 및 목록 갱신
      if (data.sessionId && !currentSessionId) {
        setCurrentSessionId(data.sessionId)
        fetchChatSessions()
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || '응답을 생성할 수 없습니다.',
        sources: data.sources,
        suggestions: data.suggestions
      }])
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '오류가 발생했습니다. 다시 시도해주세요.'
      }])
    }
    setIsLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const selectMeeting = (meetingId: string) => {
    setSelectedMeeting(meetingId)
    setSidebarOpen(false)
  }

  const exampleQuestions = [
    '오늘 회의에서 결정된 사항이 뭐야?',
    '마케팅 관련 논의 내용 정리해줘',
    '지난 주 회의에서 나온 액션 아이템 알려줘',
  ]

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return '오늘'
    if (days === 1) return '어제'
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  if (status === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 font-medium">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (!session) return null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      {/* 헤더 */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-gray-200 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-lg lg:hidden transition-colors"
          >
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
              <span className="text-white text-lg">🎙️</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">미팅챗</h1>
              <p className="text-xs text-gray-500 hidden sm:block">AI 회의록 검색</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {session.user?.image && (
            <img src={session.user.image} alt="Profile" className="w-8 h-8 rounded-full ring-2 ring-gray-100" />
          )}
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{session.user?.name}</span>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            로그아웃
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* 오버레이 */}
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* 사이드바 */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-30
          w-80 bg-white border-r border-gray-200 shadow-lg lg:shadow-none
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}>
          <div className="flex items-center justify-between p-4 border-b border-gray-100 lg:hidden">
            <span className="font-semibold text-gray-900">메뉴</span>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 새 대화 버튼 */}
          <div className="p-4">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 대화
            </button>
          </div>

          {/* 탭 */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'history'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              기록
            </button>
            <button
              onClick={() => setActiveTab('bookmarks')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === 'bookmarks'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              저장됨
              {bookmarks.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-600 rounded-full">
                  {bookmarks.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('filter')}
              className={`flex-1 px-3 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'filter'
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              필터
            </button>
          </div>

          {/* 탭 내용 */}
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'bookmarks' ? (
              <div className="p-4">
                {bookmarks.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500">저장된 답변이 없어요</p>
                    <p className="text-xs text-gray-400 mt-1">유용한 답변을 저장해보세요!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bookmarks.map(b => (
                      <div
                        key={b.id}
                        className="p-3 rounded-xl border border-gray-200 hover:border-gray-300 bg-white transition-all group cursor-pointer"
                        onClick={() => loadBookmark(b)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-700 truncate">{b.question}</div>
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">{b.answer.slice(0, 100)}...</div>
                            <div className="text-xs text-gray-400 mt-1">{formatDate(b.createdAt)}</div>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteBookmark(b.id) }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-all shrink-0"
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'history' ? (
              <div className="p-4">
                {chatSessions.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500">아직 대화 기록이 없어요</p>
                    <p className="text-xs text-gray-400 mt-1">질문을 시작해보세요!</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {chatSessions.map(s => (
                      <button
                        key={s.id}
                        onClick={() => loadSession(s.id)}
                        className={`w-full text-left p-3 rounded-xl text-sm transition-all group ${
                          currentSessionId === s.id
                            ? 'bg-indigo-50 ring-1 ring-indigo-200'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className={`truncate font-medium ${currentSessionId === s.id ? 'text-indigo-700' : 'text-gray-700'}`}>
                              {s.title}
                            </div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {formatDate(s.lastMessageAt || s.createdAt)}
                            </div>
                          </div>
                          <button
                            onClick={(e) => deleteSession(s.id, e)}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-200 rounded transition-all"
                          >
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                {/* 프로젝트 선택 */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">프로젝트</label>
                  <select
                    value={selectedProject}
                    onChange={(e) => {
                      setSelectedProject(e.target.value)
                      setSelectedMeeting('')
                    }}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="">전체 프로젝트</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>

                {/* 회의 선택 */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">회의</label>
                  <select
                    value={selectedMeeting}
                    onChange={(e) => selectMeeting(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  >
                    <option value="">전체 회의</option>
                    {meetings.map(m => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </div>

                {/* 최근 회의 목록 */}
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">최근 회의</h3>
                  {meetings.length === 0 ? (
                    <p className="text-sm text-gray-400">접근 가능한 회의가 없습니다.</p>
                  ) : (
                    <div className="space-y-1">
                      {meetings.slice(0, 8).map(m => (
                        <button
                          key={m.id}
                          onClick={() => selectMeeting(m.id)}
                          className={`w-full text-left p-3 rounded-xl text-sm transition-all ${
                            selectedMeeting === m.id
                              ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                              : 'hover:bg-gray-50 text-gray-700'
                          }`}
                        >
                          <div className="truncate font-medium">{m.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* 메인 영역 */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white lg:rounded-tl-2xl lg:border-l lg:border-gray-100">
          {/* 상단 액션 바 */}
          {(messages.length > 0 || selectedProject || selectedMeeting) && (
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">
                {selectedProject && `🎯 ${projects.find(p => p.id === selectedProject)?.name}`}
                {selectedProject && selectedMeeting && ' › '}
                {selectedMeeting && meetings.find(m => m.id === selectedMeeting)?.title}
                {!selectedProject && !selectedMeeting && messages.length > 0 && '대화 중...'}
              </p>
              {messages.length > 0 && currentSessionId && (
                <button
                  onClick={() => exportChat('markdown')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  내보내기
                </button>
              )}
            </div>
          )}

          {/* 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6">
                  <span className="text-4xl">🎙️</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">회의 내용에 대해 물어보세요</h2>
                <p className="text-gray-500 mb-8 max-w-lg">
                  전사된 회의 내용을 AI가 분석하여 필요한 정보를 찾아드립니다
                </p>

                <div className="space-y-2 w-full max-w-lg">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">예시 질문</p>
                  {exampleQuestions.map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(q)}
                      className="block w-full text-left px-4 py-3.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 hover:border-gray-300 text-sm text-gray-600 transition-all"
                    >
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {messages.map((msg, i) => (
                  <div key={i} className="mb-8">
                    {msg.role === 'user' ? (
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-600 text-sm font-bold">Q</span>
                        </div>
                        <div className="pt-1">
                          <p className="text-gray-800 font-medium">{msg.content}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                              <span className="text-emerald-600 text-xs font-bold">A</span>
                            </div>
                            <span className="text-sm font-medium text-gray-600">AI 응답</span>
                          </div>
                          <button
                            onClick={() => {
                              const prevMsg = messages[i - 1]
                              if (prevMsg?.role === 'user') {
                                addBookmark(prevMsg.content, msg.content, msg.sources)
                              }
                            }}
                            className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors group"
                            title="이 답변 저장하기"
                          >
                            <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </button>
                        </div>
                        <div className="px-5 py-5">
                          <div className="prose prose-gray prose-sm sm:prose-base max-w-none
                            prose-headings:text-gray-900 prose-headings:font-semibold
                            prose-p:text-gray-600 prose-p:leading-relaxed
                            prose-strong:text-gray-800 prose-strong:font-semibold
                            prose-ul:text-gray-600 prose-ol:text-gray-600
                            prose-li:marker:text-gray-400
                            prose-code:text-indigo-600 prose-code:bg-indigo-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-normal
                            prose-pre:bg-gray-50 prose-pre:border prose-pre:border-gray-200
                            prose-blockquote:border-indigo-300 prose-blockquote:text-gray-500
                            prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
                          ">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                <span>📄</span> 참고한 내용
                              </p>
                              <div className="grid gap-2">
                                {msg.sources.map((src, j) => (
                                  <div key={j} className="text-xs bg-gray-50 rounded-xl p-3 border border-gray-100">
                                    <div className="font-semibold text-gray-700 mb-1">{src.title}</div>
                                    <div className="text-gray-500 line-clamp-2">{src.content}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 후속 질문 제안 */}
                          {msg.suggestions && msg.suggestions.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-gray-100">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                                <span>💡</span> 이것도 물어보세요
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {msg.suggestions.map((suggestion, j) => (
                                  <button
                                    key={j}
                                    onClick={() => setInput(suggestion)}
                                    className="text-sm px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors text-left"
                                  >
                                    {suggestion}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="mb-8">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                          <span className="text-emerald-600 text-xs font-bold">A</span>
                        </div>
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        </div>
                        <span className="text-sm text-gray-500">답변 생성 중...</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* 입력 영역 */}
          <div className="border-t border-gray-200 bg-gray-50 p-4 shrink-0">
            <div className="max-w-4xl mx-auto">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="회의 내용에 대해 질문하세요..."
                  className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 shadow-sm transition-all"
                  disabled={isLoading}
                />
                <button
                  onClick={sendMessage}
                  disabled={isLoading || !input.trim()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl font-medium shadow-sm shadow-indigo-500/20 transition-all text-base"
                >
                  전송
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
