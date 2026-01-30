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

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<string>('')
  const [selectedProject, setSelectedProject] = useState<string>('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
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
          projectId: selectedProject || undefined
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

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response || '응답을 생성할 수 없습니다.',
        sources: data.sources
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
          w-72 bg-white border-r border-gray-200 shadow-lg lg:shadow-none
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          flex flex-col
        `}>
          <div className="flex items-center justify-between p-4 border-b border-gray-100 lg:hidden">
            <span className="font-semibold text-gray-900">필터</span>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-4 border-b border-gray-100 space-y-4">
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
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">최근 회의</h3>
            {meetings.length === 0 ? (
              <p className="text-sm text-gray-400">접근 가능한 회의가 없습니다.</p>
            ) : (
              <div className="space-y-1">
                {meetings.slice(0, 10).map(m => (
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
        </aside>

        {/* 메인 영역 */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white lg:rounded-tl-2xl lg:border-l lg:border-gray-100">
          {(selectedProject || selectedMeeting) && (
            <div className="px-4 py-2.5 bg-indigo-50 border-b border-indigo-100 lg:hidden">
              <p className="text-xs font-medium text-indigo-600">
                🎯 {selectedProject && projects.find(p => p.id === selectedProject)?.name}
                {selectedProject && selectedMeeting && ' › '}
                {selectedMeeting && meetings.find(m => m.id === selectedMeeting)?.title}
              </p>
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
                      /* 질문 */
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                          <span className="text-indigo-600 text-sm font-bold">Q</span>
                        </div>
                        <div className="pt-1">
                          <p className="text-gray-800 font-medium">{msg.content}</p>
                        </div>
                      </div>
                    ) : (
                      /* 답변 */
                      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                            <span className="text-emerald-600 text-xs font-bold">A</span>
                          </div>
                          <span className="text-sm font-medium text-gray-600">AI 응답</span>
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
                            prose-table:text-sm
                            prose-th:bg-gray-50 prose-th:px-3 prose-th:py-2 prose-th:font-semibold
                            prose-td:px-3 prose-td:py-2 prose-td:border-gray-200
                          ">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {msg.content}
                            </ReactMarkdown>
                          </div>

                          {/* 출처 */}
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
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="mb-8">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                      <div className="flex items-center gap-3">
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
              {(selectedProject || selectedMeeting) && (
                <p className="text-xs text-gray-400 mt-2 hidden lg:block">
                  🎯 {selectedProject && `프로젝트: ${projects.find(p => p.id === selectedProject)?.name}`}
                  {selectedProject && selectedMeeting && ' | '}
                  {selectedMeeting && `회의: ${meetings.find(m => m.id === selectedMeeting)?.title}`}
                </p>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
