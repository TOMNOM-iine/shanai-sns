'use client'

import { useEffect, useRef, useState } from 'react'

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

export default function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const [isListening, setIsListening] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const SpeechRecognitionClass =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionClass) {
      setSupported(false)
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'ja-JP'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result.isFinal) {
          finalTranscript += result[0].transcript
        }
      }
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim())
      }
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
  }, [onTranscript])

  const toggleListening = () => {
    if (!recognitionRef.current || disabled) return
    if (isListening) {
      recognitionRef.current.stop()
      setIsListening(false)
      return
    }
    try {
      recognitionRef.current.start()
      setIsListening(true)
    } catch {
      setIsListening(false)
    }
  }

  if (!supported) {
    return null
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      className={`pixel-btn px-3 ${isListening ? 'bg-red-500 text-white' : ''}`}
      title={isListening ? '音声入力停止' : '音声入力'}
    >
      {isListening ? '🎙️ 停止' : '🎙️'}
    </button>
  )
}
