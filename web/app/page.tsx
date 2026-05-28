"use client";

import { useChat } from '@ai-sdk/react';
import { Send, ShieldAlert, FileText, Loader2, HardHat } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
      <header className="flex-shrink-0 bg-hdc-black text-hdc-ivory px-4 py-4 flex items-center justify-between shadow-md z-10 relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-hdc-umber"></div>
        <div className="flex items-center gap-3 mt-1">
          <HardHat className="w-6 h-6 text-hdc-umber" />
          <h1 className="text-[17px] font-bold tracking-tight">HDC 현장 안전 도우미</h1>
        </div>
        <span className="text-[10px] text-hdc-gray opacity-70 uppercase tracking-widest mt-1">Visionary Life Creator</span>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-hdc-dark-gray px-4">
            <div className="w-16 h-16 bg-hdc-umber/10 rounded-full flex items-center justify-center mb-5">
              <ShieldAlert className="w-8 h-8 text-hdc-umber" />
            </div>
            <p className="text-[17px] font-semibold text-hdc-black mb-2">안전한 현장을 위한 첫 걸음</p>
            <p className="text-[14px] text-hdc-dark-gray/80 max-w-xs leading-relaxed">
              위반 상황(예: 안전모 미착용)을 입력하시면 
              관련 법령 및 과태료 기준을 안내하고,
              협력사 경고 공문 초안을 작성해 드립니다.
            </p>
          </div>
        )}
        
        {messages.map(m => (
          <div key={m.id} className={cn("flex w-full", m.role === 'user' ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[85%] sm:max-w-[75%] rounded-[20px] px-4 py-3 shadow-sm",
              m.role === 'user' 
                ? "bg-hdc-umber text-hdc-ivory rounded-tr-sm" 
                : "bg-white text-hdc-black border border-gray-200 rounded-tl-sm"
            )}>
              <div className="text-[15px] leading-[1.6] whitespace-pre-wrap">
                {m.content}
              </div>
              
              {/* Tool Invocations */}
              {m.toolInvocations?.map((toolInvocation: any) => {
                const isToolComplete = 'result' in toolInvocation;
                
                return (
                  <div key={toolInvocation.toolCallId} className="mt-3 p-3 bg-[#F8F9FA] border border-gray-100 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-[13px] font-medium text-hdc-black">
                      {!isToolComplete ? (
                        <Loader2 className="w-4 h-4 animate-spin text-hdc-umber" />
                      ) : (
                        <FileText className="w-4 h-4 text-hdc-umber" />
                      )}
                      <span>
                        {toolInvocation.toolName === 'search_safety_law' ? '안전 법령 데이터베이스 검색' : 
                         toolInvocation.toolName === 'draft_warning_letter' ? '경고 공문 초안 작성' : 
                         '도구 사용 중...'}
                      </span>
                    </div>
                    {isToolComplete && (
                      <div className="text-[12px] text-hdc-dark-gray/60 font-medium">
                        작업이 완료되었습니다.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'user' && (
          <div className="flex w-full justify-start">
            <div className="bg-white border border-gray-200 rounded-[20px] rounded-tl-sm px-5 py-4 shadow-sm flex gap-2 items-center">
              <span className="w-2 h-2 rounded-full bg-hdc-umber/60 animate-bounce"></span>
              <span className="w-2 h-2 rounded-full bg-hdc-umber/60 animate-bounce" style={{ animationDelay: '0.15s' }}></span>
              <span className="w-2 h-2 rounded-full bg-hdc-umber/60 animate-bounce" style={{ animationDelay: '0.3s' }}></span>
            </div>
          </div>
        )}
        {error && (
          <div className="flex w-full justify-center">
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-[12px] px-4 py-3 text-[14px]">
              오류가 발생했습니다: {error.message || 'API 키가 설정되지 않았거나 잘못되었습니다.'}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </main>

      {/* Input Area */}
      <footer className="flex-shrink-0 bg-white border-t border-gray-200 p-4 pb-6">
        <form onSubmit={onSubmit} className="relative flex items-end gap-2 max-w-4xl mx-auto">
          <textarea
            className="w-full bg-[#F5F5F5] border-transparent text-hdc-black rounded-[24px] pl-4 pr-12 py-[14px] text-[15px] focus:outline-none focus:ring-1 focus:ring-hdc-umber focus:bg-white transition-all resize-none overflow-y-auto min-h-[52px] max-h-[120px] shadow-inner leading-relaxed"
            rows={1}
            value={input}
            placeholder="상황을 입력하세요..."
            onChange={(e) => {
              handleInputChange(e);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
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
            className="absolute right-[6px] bottom-[6px] w-[40px] h-[40px] flex items-center justify-center bg-hdc-black text-white rounded-full hover:bg-hdc-umber disabled:opacity-50 disabled:bg-hdc-dark-gray disabled:cursor-not-allowed transition-colors shadow-md"
          >
            <Send className="w-4 h-4 ml-[-2px] mt-[2px]" />
          </button>
        </form>
      </footer>
    </div>
  );
}
