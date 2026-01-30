'use client'

import { useState, useRef, useEffect } from 'react'

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

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [selectedMeeting, setSelectedMeeting] = useState<string>('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchMeetings()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const fetchMeetings = async () => {
    try {
      const res = await fetch('/api/meetings')
      const data = await res.json()
      if (data.meetings) setMeetings(data.meetings)
    } catch (e) {
      console.error('Failed to fetch meetings:', e)
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
          meetingId: selectedMeeting || undefined
        }),
      })
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

  const exampleQuestions = [
    '오늘 회의에서 결정된 사항이 뭐야?',
    '마케팅 관련 논의 내용 정리해줘',
    '지난 주 회의에서 나온 액션 아이템 알려줘',
  ]

  return (
    <div className="flex h-screen">
      {/* 사이드바 */}
      <div className="w-72 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-xl font-bold flex items-center gap-2">
            💬 미팅챗
          </h1>
          <p className="text-xs text-gray-500 mt-1">회의 내용과 대화하기</p>
        </div>

        {/* 회의 필터 */}
        <div className="p-4">
          <label className="text-xs text-gray-400 block mb-2">회의 선택</label>
          <select
            value={selectedMeeting}
            onChange={(e) => setSelectedMeeting(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">전체 회의에서 검색</option>
            {meetings.map(m => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </div>

        {/* 최근 회의 */}
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-xs text-gray-400 mb-3">최근 회의</h3>
          <div className="space-y-2">
            {meetings.slice(0, 10).map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedMeeting(m.id)}
                className={`w-full text-left p-2 rounded-lg text-sm transition-colors ${
                  selectedMeeting === m.id 
                    ? 'bg-blue-600/20 text-blue-400' 
                    : 'hover:bg-gray-800 text-gray-300'
                }`}
              >
                <div className="truncate">{m.title}</div>
                <div className="text-xs text-gray-500">
                  {new Date(m.createdAt).toLocaleDateString('ko-KR')}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 메인 채팅 영역 */}
      <div className="flex-1 flex flex-col">
        {/* 채팅 메시지 */}
        <div className="flex-1 overflow-y-auto p-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="text-6xl mb-4">🎙️</div>
              <h2 className="text-2xl font-bold mb-2">회의 내용에 대해 물어보세요</h2>
              <p className="text-gray-400 mb-8 max-w-md">
                전사된 회의 내용을 AI가 분석하여 필요한 정보를 찾아드립니다
              </p>
              
              <div className="space-y-2">
                <p className="text-xs text-gray-500 mb-2">예시 질문</p>
                {exampleQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => setInput(q)}
                    className="block w-full text-left px-4 py-2 rounded-lg bg-gray-800/50 hover:bg-gray-800 text-sm text-gray-300 transition-colors"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((msg, i) => (
                <div key={i} className={`chat-message flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === 'user' 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-800 text-gray-100'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    
                    {/* 출처 표시 */}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700">
                        <p className="text-xs text-gray-400 mb-2">📄 참고한 내용:</p>
                        {msg.sources.map((src, j) => (
                          <div key={j} className="text-xs bg-gray-900/50 rounded p-2 mb-1">
                            <div className="font-medium text-gray-300">{src.title}</div>
                            <div className="text-gray-500 truncate">{src.content}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* 입력 영역 */}
        <div className="border-t border-gray-800 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="회의 내용에 대해 질문하세요..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500 transition-colors"
                disabled={isLoading}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-500 rounded-xl font-medium transition-colors"
              >
                전송
              </button>
            </div>
            {selectedMeeting && (
              <p className="text-xs text-gray-500 mt-2">
                🎯 선택된 회의: {meetings.find(m => m.id === selectedMeeting)?.title}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
