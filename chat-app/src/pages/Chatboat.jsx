import { useState, useEffect, useRef } from "react";
import axios from "axios";
import "./Chatboat.css";

const Chatbot = () => {
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);

  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, loading]);

  // Auto-expand textarea
  const handleInputChange = (e) => {
    setMessage(e.target.value);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + "px";
    }
  };

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
    if (!message.trim()) return;

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
      const errorMsg = { sender: "bot", text: "Sorry, I couldn't process your request. Please try again." };
      setChat((prev) => [...prev, errorMsg]);
    }

    setMessage("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chatbot-container">
      
      <div className="chatbot-wrapper">
        
        {/* Header */}
        <div className="chatbot-header">
          <div className="chatbot-header-content">
            <h1 className="chatbot-title">Retail AI Assistant</h1>
            <span className="chatbot-status">● Online</span>
          </div>
        </div>

        {/* Chat Area */}
        <div className="chatbot-messages">
          
          {chat.length === 0 && (
            <div className="chatbot-empty-state">
              <div className="empty-icon">💬</div>
              <p className="empty-text">Ask anything about your store...</p>
              <p className="empty-subtext">Get insights on sales, inventory, and more</p>
            </div>
          )}

          {chat.map((msg, index) => (
            <div
              key={index}
              className={`chatbot-message-wrapper ${msg.sender}`}
            >
              <div
                className={`chatbot-message-bubble ${msg.sender}`}
              >
                {msg.text}
              </div>
            </div>
          ))}

          {/* Typing Indicator */}
          {loading && (
            <div className="chatbot-message-wrapper bot">
              <div className="chatbot-typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} className="chatbot-scroll-anchor"></div>
        </div>

        {/* Input Area */}
        <div className={`chatbot-input-area ${inputFocused ? "focused" : ""}`}>
          <div className="chatbot-input-wrapper">
            <textarea
              ref={inputRef}
              value={message}
              onChange={handleInputChange}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="Message Retail AI..."
              className="chatbot-input"
              rows="1"
            />
            <button
              onClick={sendMessage}
              disabled={loading || !message.trim()}
              className="chatbot-send-btn"
              title="Send message (Enter or Shift+Enter for new line)"
            >
              <span className="send-icon">📤</span>
            </button>
          </div>
          <p className="chatbot-input-hint">Press Enter to send, Shift+Enter for new line</p>
        </div>

      </div>
    </div>
  );
};

export default Chatbot;