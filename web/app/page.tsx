"use client";

import { useChat } from '@ai-sdk/react';
import { Send, ShieldAlert, FileText, Loader2, HardHat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, error } = useChat();

  // Custom form submission if needed, but we can just use the provided handleSubmit
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    handleSubmit(e);
  };
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex flex-col h-[100dvh] bg-hdc-ivory overflow-hidden font-sans">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between shadow-sm z-10 relative gap-3 sm:gap-0">
        <div className="absolute top-0 left-0 w-full h-1 bg-hdc-crimson"></div>
        <div className="flex items-center gap-3 mt-1">
          <HardHat className="w-6 h-6 text-hdc-crimson" />
          <h1 className="text-[18px] font-bold tracking-tight text-hdc-black">HDC 현장 안전보건 도우미</h1>
          <span className="inline-flex items-center px-3 py-1 rounded-md text-[12px] font-semibold bg-hdc-crimson text-white shadow-sm ml-2">
            📍 인천 갈산 1구역
          </span>
        </div>
        <span className="text-[11px] font-medium text-hdc-dark-gray opacity-80 uppercase tracking-widest mt-1 sm:mt-0">Enterprise Safety System</span>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-hdc-ivory">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-hdc-dark-gray px-4">
            <div className="w-20 h-20 bg-white border border-gray-200 shadow-sm rounded-2xl flex items-center justify-center mb-6">
              <ShieldAlert className="w-10 h-10 text-hdc-crimson" />
            </div>
            <p className="text-[20px] font-bold text-hdc-black mb-3">안전한 현장을 위한 스마트 모니터링</p>
            <p className="text-[15px] text-hdc-dark-gray/80 max-w-md leading-relaxed">
              위반 상황(예: 안전모 미착용)을 입력하시면 
              관련 법령, 세부 조항 및 과태료 기준을 
              정확하고 신속하게 안내해 드립니다.
            </p>
          </div>
        )}
        
        {messages.map(m => (
          <div key={m.id} className={cn("flex w-full", m.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[95%] sm:max-w-[85%] rounded-[12px] px-6 py-5 shadow-sm",
              m.role === 'user' 
                ? "bg-hdc-crimson text-white rounded-tr-sm" 
                : "bg-white text-hdc-black border border-gray-200 rounded-tl-sm"
            )}>
              <div className="text-[15px] leading-[1.7] whitespace-pre-wrap markdown-body">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm]}
                  components={{
                    table: ({node, ...props}) => <div className="overflow-x-auto my-5"><table className="w-full text-sm text-left border-collapse border border-gray-200 shadow-sm rounded-lg" {...props} /></div>,
                    thead: ({node, ...props}) => <thead className="bg-[#F8F9FA] text-hdc-black font-bold border-b border-gray-300" {...props} />,
                    th: ({node, ...props}) => <th className="px-5 py-4 border border-gray-200 whitespace-nowrap bg-gray-50" {...props} />,
                    td: ({node, ...props}) => <td className="px-5 py-4 border border-gray-200 align-top" {...props} />,
                    tr: ({node, ...props}) => <tr className="hover:bg-gray-50/50 transition-colors" {...props} />,
                    p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-bold text-hdc-crimson" {...props} />,
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex w-full justify-start">
            <div className="bg-white border border-gray-200 rounded-[12px] rounded-tl-sm px-6 py-5 shadow-sm flex gap-2 items-center">
              <span className="w-2.5 h-2.5 rounded-full bg-hdc-crimson/70 animate-bounce"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-hdc-crimson/70 animate-bounce" style={{ animationDelay: '0.15s' }}></span>
              <span className="w-2.5 h-2.5 rounded-full bg-hdc-crimson/70 animate-bounce" style={{ animationDelay: '0.3s' }}></span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex w-full justify-center mt-4">
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-[8px] px-5 py-3 text-[14px] font-medium shadow-sm">
              오류가 발생했습니다: {error.message || '시스템 통신 중 문제가 발생했습니다.'}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </main>

      {/* Input Area */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 p-4 sm:p-6">
        <form onSubmit={onSubmit} className="relative flex items-end gap-3 max-w-5xl mx-auto">
          <textarea
            className="w-full bg-[#F9FAFB] border border-gray-300 text-hdc-black rounded-[8px] pl-5 pr-14 py-[16px] text-[15px] focus:outline-none focus:ring-2 focus:ring-hdc-crimson/50 focus:border-hdc-crimson transition-all resize-none overflow-y-auto min-h-[56px] max-h-[150px] shadow-sm leading-relaxed"
            rows={1}
            value={input}
            placeholder="현장 위반 상황을 구체적으로 입력해 주십시오..."
            onChange={(e) => {
              handleInputChange(e);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit(e as any);
              }
            }}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="absolute right-[8px] bottom-[8px] w-[42px] h-[42px] flex items-center justify-center bg-hdc-crimson text-white rounded-[6px] hover:bg-[#7A0000] disabled:opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            <Send className="w-4 h-4 ml-[-2px] mt-[2px]" />
          </button>
        </form>
      </footer>
    </div>
  );
}
