import React, { useState, useEffect } from "react";
import axios from "axios";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  sender: string;
  text: string;
}

const Chatbot = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      setRecognition(rec);
    }
  }, []);

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { sender: "user", text: input }];
    setMessages(newMessages);
    setInput("");

    try {
      const response = await axios.post(
        `${API_URL}?key=${GEMINI_API_KEY}`,
        {
          contents: [{ parts: [{ text: input }] }],
        }
      );

      const botReply =
        response.data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";

      setMessages([...newMessages, { sender: "bot", text: botReply }]);
    } catch (error: any) {
      console.error("Gemini API Error:", error.response?.data || error.message);
      const errorMessage = error.response?.status === 400
        ? "⚠️ Invalid request. Check your API key or input."
        : error.response?.status === 403
        ? "⚠️ API key invalid or expired. Please check your Gemini API key."
        : error.response?.status === 429
        ? "⚠️ Rate limit exceeded. Try again later."
        : "⚠️ Error connecting to Gemini API. Please check your internet connection.";
      setMessages([
        ...newMessages,
        { sender: "bot", text: errorMessage },
      ]);
    }
  };

  return (
    <div className="flex flex-col items-center p-4">
      <div className="w-full max-w-md bg-gray-100 p-4 rounded-2xl shadow-lg h-[500px] overflow-y-auto">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`my-2 p-2 rounded-xl ${
              msg.sender === "user"
                ? "bg-blue-500 text-white self-end text-right"
                : "bg-white text-gray-800"
            }`}
          >
            {msg.text}
          </div>
        ))}
      </div>
      <div className="flex w-full max-w-md mt-3">
        <input
          className="flex-grow p-2 border rounded-l-lg"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask something..."
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <Button
          onClick={isListening ? stopListening : startListening}
          variant="outline"
          size="sm"
          className={`px-3 ${isListening ? 'bg-red-500 text-white' : ''}`}
        >
          {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
        <button
          onClick={sendMessage}
          className="bg-blue-600 text-white px-4 rounded-r-lg"
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default Chatbot;
