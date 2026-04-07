import { useState, useEffect, useRef } from "react";
import axios from "axios";

const Chatbot = () => {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);

  const chatEndRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, loading]);

  // Typing animation (typewriter effect)
  const typeText = (text, callback) => {
    let i = 0;
    let current = "";

    const interval = setInterval(() => {
      current += text[i];
      i++;

      callback(current);

      if (i === text.length) {
        clearInterval(interval);
      }
    }, 20); // speed of typing
  };

  const sendMessage = async () => {
    if (!message) return;

    const userMsg = { sender: "user", text: message };
    setChat((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await axios.post("http://localhost:5000/api/ai/chat", {
        message
      });

      let botMsg = { sender: "bot", text: "" };
      setChat((prev) => [...prev, botMsg]);

      // Typing effect
      typeText(res.data.reply, (typedText) => {
        setChat((prev) => {
          const updated = [...prev];
          updated[updated.length - 1].text = typedText;
          return updated;
        });
      });

    } catch (err) {
      console.log(err);
    }

    setMessage("");
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center items-center p-4">
      
      <div className="w-full max-w-3xl bg-white shadow-xl rounded-2xl flex flex-col h-[85vh]">
        
        {/* Header */}
        <div className="p-4 border-b text-lg font-semibold text-gray-800 flex justify-between">
          <span>Retail AI Assistant</span>
          <span className="text-sm text-green-500">● Online</span>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {chat.length === 0 && (
            <p className="text-center text-gray-400">
              Ask anything about your store...
            </p>
          )}

          {chat.map((msg, index) => (
            <div
              key={index}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl max-w-sm break-words shadow ${
                  msg.sender === "user"
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-gray-800"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-gray-200 px-4 py-2 rounded-2xl shadow flex gap-1">
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-300"></span>
              </div>
            </div>
          )}

          <div ref={chatEndRef}></div>
        </div>

        {/* Input */}
        <div className="p-3 border-t flex gap-2">
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Message Retail AI..."
            className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          <button
            onClick={sendMessage}
            className="bg-blue-500 hover:bg-blue-600 text-white px-5 py-2 rounded-full font-medium transition"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  );
};

export default Chatbot;