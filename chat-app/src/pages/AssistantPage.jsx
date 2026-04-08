import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import EmptyState from "../components/EmptyState";
import LoadingState from "../components/LoadingState";
import MetricCard from "../components/MetricCard";
import SectionCard from "../components/SectionCard";
import api, { getErrorMessage } from "../lib/api";
import { formatCurrency, formatNumber } from "../lib/formatters";

const VOICE_REPLY_STORAGE_KEY = "shop-pilot-voice-reply-v1";

function createWelcomeMessage(summary) {
  if (!summary) {
    return {
      role: "assistant",
      content:
        "I am ready to help with retail insights. Ask about stock levels, revenue, top products, or next actions.",
      timestamp: new Date().toISOString(),
    };
  }

  return {
    role: "assistant",
    content: [
      "I am synced with the current store snapshot.",
      `- Revenue: ${formatCurrency(summary.totals.totalRevenue)}`,
      `- Inventory value: ${formatCurrency(summary.totals.inventoryValue)}`,
      `- Low-stock items: ${formatNumber(summary.totals.lowStockCount)}`,
      "- Ask a product, stock, sales, or comparison question to get an exact answer.",
    ].join("\n"),
    timestamp: new Date().toISOString(),
  };
}

function normalizeListItem(value) {
  return value.replace(/^[-*]\s*/, "").trim();
}

function parseMessageContent(content) {
  const lines = String(content || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return {
      heading: "",
      paragraphs: [],
      bullets: [],
    };
  }

  return {
    heading: lines[0],
    paragraphs: lines.slice(1).filter((line) => !/^[-*]\s+/.test(line)),
    bullets: lines
      .slice(1)
      .filter((line) => /^[-*]\s+/.test(line))
      .map(normalizeListItem),
  };
}

function getSpeechRecognition() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function getSpeechErrorMessage(errorCode) {
  switch (errorCode) {
    case "audio-capture":
      return "Microphone access is unavailable on this device.";
    case "network":
      return "Voice recognition needs a stable network connection.";
    case "not-allowed":
    case "service-not-allowed":
      return "Allow microphone access to use voice commands.";
    case "no-speech":
      return "No voice was detected. Try speaking a little closer to the mic.";
    default:
      return "Voice recognition could not complete. Please try again.";
  }
}

function sanitizeAssistantMessage(message) {
  if (message?.role !== "assistant") {
    return message;
  }

  return {
    ...message,
    content: String(message.content || "").replace(/\bCodex\b/gi, "Retail Intelligence Assistant"),
  };
}

function getStoredVoiceReplyPreference() {
  try {
    return localStorage.getItem(VOICE_REPLY_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function formatSpeechText(content) {
  return String(content || "")
    .replace(/^[-*]\s*/gm, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function MessageBody({ content, role }) {
  const parsed = parseMessageContent(content);
  const highlightHeading =
    role === "assistant" && (parsed.paragraphs.length || parsed.bullets.length);

  return (
    <div className="chat-message-body">
      {parsed.heading ? (
        <p className={highlightHeading ? "chat-heading" : undefined}>
          {parsed.heading}
        </p>
      ) : null}

      {parsed.paragraphs.map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}

      {parsed.bullets.length ? (
        <ul className="chat-list">
          {parsed.bullets.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function AssistantPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const chatStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const inputValueRef = useRef("");
  const transcriptRef = useRef("");
  const manualStopRef = useRef(false);
  const sendMessageRef = useRef(() => {});
  const speechSynthesisRef = useRef(null);

  const [summary, setSummary] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [capabilities, setCapabilities] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [voiceDraft, setVoiceDraft] = useState("");
  const [voiceReplySupported, setVoiceReplySupported] = useState(false);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(
    getStoredVoiceReplyPreference()
  );

  async function loadAssistant() {
    setLoading(true);
    setError("");

    try {
      const [summaryResult, suggestionResult, historyResult] = await Promise.allSettled([
        api.get("/analytics/overview"),
        api.get("/ai/suggestions"),
        api.get("/ai/history"),
      ]);

      if (summaryResult.status !== "fulfilled") {
        throw summaryResult.reason;
      }

      const summaryData = summaryResult.value.data;
      const suggestionData =
        suggestionResult.status === "fulfilled" ? suggestionResult.value.data : null;
      const historyData =
        historyResult.status === "fulfilled" ? historyResult.value.data : null;

      setSummary(summaryData);
      setSuggestions(
        suggestionData?.prompts ||
          summaryData?.assistantPrompts ||
          []
      );
      setCapabilities(suggestionData?.capabilities || []);

      const historyMessages = (historyData?.messages || []).map(sanitizeAssistantMessage);

      setMessages(
        historyMessages.length
          ? historyMessages
          : [createWelcomeMessage(summaryData)]
      );
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Unable to load assistant context right now."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssistant();
  }, []);

  useEffect(() => {
    inputValueRef.current = input;
  }, [input]);

  useEffect(() => {
    const chatStream = chatStreamRef.current;

    if (!chatStream) {
      return;
    }

    chatStream.scrollTo({
      top: chatStream.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => {
    const prompt = location.state?.prompt;

    if (prompt) {
      setInput(prompt);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      setVoiceReplySupported(false);
      setVoiceReplyEnabled(false);
      return undefined;
    }

    speechSynthesisRef.current = window.speechSynthesis;
    setVoiceReplySupported(true);

    return () => {
      window.speechSynthesis.cancel();
      speechSynthesisRef.current = null;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        VOICE_REPLY_STORAGE_KEY,
        voiceReplySupported && voiceReplyEnabled ? "true" : "false"
      );
    } catch {
      // Ignore preference persistence issues.
    }
  }, [voiceReplyEnabled, voiceReplySupported]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();

    if (!SpeechRecognition) {
      setVoiceSupported(false);
      return undefined;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      manualStopRef.current = false;
      transcriptRef.current = "";
      setVoiceDraft("");
      setVoiceStatus("Listening... Speak your question now.");
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = transcriptRef.current;
      let interimTranscript = "";

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = String(result?.[0]?.transcript || "").trim();

        if (!text) {
          continue;
        }

        if (result.isFinal) {
          finalTranscript = `${finalTranscript} ${text}`.trim();
        } else {
          interimTranscript = `${interimTranscript} ${text}`.trim();
        }
      }

      transcriptRef.current = finalTranscript;
      setVoiceDraft([finalTranscript, interimTranscript].filter(Boolean).join(" "));
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted" && manualStopRef.current) {
        return;
      }

      setVoiceStatus(getSpeechErrorMessage(event.error));
      setIsListening(false);
      setVoiceDraft("");
      transcriptRef.current = "";
    };

    recognition.onend = () => {
      const finalTranscript = String(transcriptRef.current || "").trim();

      setIsListening(false);
      setVoiceDraft("");
      transcriptRef.current = "";

      if (manualStopRef.current) {
        manualStopRef.current = false;

        if (!finalTranscript) {
          setVoiceStatus("Voice capture stopped.");
          return;
        }
      }

      if (!finalTranscript) {
        setVoiceStatus("No voice was captured. Try again.");
        return;
      }

      const existingDraft = inputValueRef.current.trim();

      if (existingDraft) {
        setInput(`${existingDraft} ${finalTranscript}`.trim());
        setVoiceStatus("Voice text was added to your draft.");
        return;
      }

      setVoiceStatus("Voice question captured and sent.");
      sendMessageRef.current(finalTranscript);
    };

    recognitionRef.current = recognition;
    setVoiceSupported(true);
    setVoiceStatus("");

    return () => {
      manualStopRef.current = true;

      try {
        recognition.abort();
      } catch {
        // Ignore cleanup failures from inactive recognizers.
      }

      recognitionRef.current = null;
    };
  }, []);

  function speakAssistantReply(content, force = false) {
    if ((!voiceReplyEnabled && !force) || !voiceReplySupported) {
      return;
    }

    const speechSynthesis = speechSynthesisRef.current;

    if (!speechSynthesis) {
      return;
    }

    const message = formatSpeechText(content);

    if (!message) {
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.lang = "en-IN";
    speechSynthesis.speak(utterance);
  }

  function stopAssistantSpeech() {
    speechSynthesisRef.current?.cancel();
  }

  async function sendMessage(overrideMessage) {
    const nextMessage = (overrideMessage ?? input).trim();

    if (!nextMessage || sending) {
      return;
    }

    const userEntry = {
      role: "user",
      content: nextMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((current) => [...current, userEntry]);
    setInput("");
    setSending(true);
    setError("");

    try {
      const response = await api.post("/ai/chat", {
        message: nextMessage,
      });

      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.data.reply,
          timestamp: response.data.generatedAt || new Date().toISOString(),
          source: response.data.source,
          intent: response.data.intent,
          matchedProducts: response.data.matchedProducts || [],
          matchedCustomers: response.data.matchedCustomers || [],
        },
      ]);
      speakAssistantReply(response.data.reply);

      if (response.data.suggestedPrompts?.length) {
        setSuggestions(response.data.suggestedPrompts);
      }

      if (response.data.capabilities?.length) {
        setCapabilities(response.data.capabilities);
      }
    } catch (requestError) {
      const message = getErrorMessage(
        requestError,
        "The assistant could not respond right now."
      );

      setError(message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: message,
          timestamp: new Date().toISOString(),
          source: "error",
          intent: "error",
          matchedProducts: [],
          matchedCustomers: [],
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  sendMessageRef.current = sendMessage;

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage();
  }

  function handleVoiceToggle() {
    if (sending) {
      return;
    }

    const recognition = recognitionRef.current;

    if (!recognition) {
      setVoiceStatus("Voice input is not available in this browser.");
      return;
    }

    if (isListening) {
      manualStopRef.current = true;
      recognition.stop();
      return;
    }

    transcriptRef.current = "";
    manualStopRef.current = false;
    setVoiceDraft("");
    setVoiceStatus("");
    setError("");

    try {
      recognition.start();
    } catch {
      setVoiceStatus("Voice recognition is already running. Please wait a moment.");
    }
  }

  function clearConversation() {
    if (isListening && recognitionRef.current) {
      manualStopRef.current = true;
      recognitionRef.current.stop();
    }

    stopAssistantSpeech();

    const welcome = createWelcomeMessage(summary);
    setMessages([welcome]);
    setError("");
    setVoiceStatus("");
    setVoiceDraft("");

    api.delete("/ai/history").catch(() => null);
  }

  function handleVoiceReplyToggle() {
    if (!voiceReplySupported) {
      return;
    }

    setVoiceReplyEnabled((current) => {
      const nextValue = !current;

      if (!nextValue) {
        stopAssistantSpeech();
      } else {
        const latestAssistantMessage = [...messages]
          .reverse()
          .find((message) => message.role === "assistant");

        if (latestAssistantMessage) {
          speakAssistantReply(latestAssistantMessage.content, true);
        }
      }

      return nextValue;
    });
  }

  if (loading) {
    return <LoadingState title="Connecting the retail assistant..." />;
  }

  return (
    <div className="page-stack">
      <div className="metric-grid">
        <MetricCard
          label="Revenue Context"
          value={formatCurrency(summary?.totals?.totalRevenue)}
          caption="Assistant answers from the current revenue snapshot"
          tone="revenue"
        />
        <MetricCard
          label="Inventory Context"
          value={formatCurrency(summary?.totals?.inventoryValue)}
          caption="Live stock value available to the assistant"
          tone="inventory"
        />
        <MetricCard
          label="Low Stock Context"
          value={formatNumber(summary?.totals?.lowStockCount)}
          caption="Critical inventory signals in the current dataset"
          tone="attention"
        />
      </div>

      {error ? <div className="alert-banner alert-error">{error}</div> : null}

      <div className="content-grid assistant-layout">
        <div className="assistant-side-stack">
          <SectionCard title="Suggested prompts" eyebrow="Ask Faster">
            {suggestions.length ? (
              <div className="prompt-grid">
                {suggestions.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="prompt-chip"
                    onClick={() => sendMessage(prompt)}
                    disabled={sending}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No prompts available"
                description="Type a custom question below to start the conversation."
              />
            )}
          </SectionCard>

          <SectionCard title="What this assistant can do" eyebrow="Capabilities">
            {capabilities.length ? (
              <div className="capability-grid">
                {capabilities.map((capability) => (
                  <article key={capability.title} className="capability-card">
                    <h4>{capability.title}</h4>
                    <p>{capability.description}</p>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Capabilities unavailable"
                description="The assistant can still answer inventory, pricing, and sales questions."
              />
            )}
          </SectionCard>

          <SectionCard title="Ask better questions" eyebrow="Playbook">
            <div className="assistant-guidance">
              <div className="assistant-guidance-row">
                <strong>Specific product</strong>
                <span>How many Mouse units are left?</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Comparison</strong>
                <span>Compare Mouse vs USB Cable.</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Sales window</strong>
                <span>How much revenue did we make this week?</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Latest sales</strong>
                <span>Show latest sales.</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Customers</strong>
                <span>List all customers.</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Customer history</strong>
                <span>What products did Nisha Kapoor buy?</span>
              </div>
              <div className="assistant-guidance-row">
                <strong>Actionable ops</strong>
                <span>Which products should I restock first?</span>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          title="Retail copilot"
          eyebrow="Conversation"
          actions={
            <div className="section-button-group">
              <button
                type="button"
                className={`button button-secondary${
                  voiceReplyEnabled ? " is-active-toggle" : ""
                }`}
                onClick={handleVoiceReplyToggle}
                disabled={!voiceReplySupported}
              >
                {voiceReplyEnabled ? "Voice replies on" : "Voice replies off"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={clearConversation}
              >
                Clear chat
              </button>
            </div>
          }
          className="chat-card"
        >
          <div className="chat-context-bar">
            <div className="context-pill">
              <span>Catalog</span>
              <strong>{formatNumber(summary?.totals?.totalProducts)} products</strong>
            </div>
            <div className="context-pill">
              <span>Orders</span>
              <strong>{formatNumber(summary?.totals?.totalOrders)} sales</strong>
            </div>
            <div className="context-pill">
              <span>Low stock</span>
              <strong>{formatNumber(summary?.totals?.lowStockCount)} alerts</strong>
            </div>
          </div>

          <div className="chat-stream" ref={chatStreamRef}>
            {messages.map((message, index) => (
              <article
                key={`${message.timestamp}-${index}`}
                className={`chat-bubble chat-${message.role}`}
              >
                <span className="chat-role">
                  {message.role === "user" ? "You" : "Assistant"}
                </span>

                <MessageBody content={message.content} role={message.role} />

                <div className="chat-meta">
                  {message.intent && message.intent !== "error" ? (
                    <span className="meta-pill chat-meta-pill">
                      {message.intent.replace(/-/g, " ")}
                    </span>
                  ) : null}

                  {message.matchedProducts?.map((product) => (
                    <span key={product} className="meta-pill chat-meta-pill">
                      {product}
                    </span>
                  ))}

                  {message.matchedCustomers?.map((customer) => (
                    <span key={customer} className="meta-pill chat-meta-pill">
                      Customer: {customer}
                    </span>
                  ))}

                  {message.source ? (
                    <span className="meta-pill chat-meta-pill chat-source-pill">
                      Source: {message.source}
                    </span>
                  ) : null}

                  {message.role === "assistant" && voiceReplySupported ? (
                    <button
                      type="button"
                      className="meta-pill chat-meta-pill chat-speak-button"
                      onClick={() => speakAssistantReply(message.content, true)}
                    >
                      Speak
                    </button>
                  ) : null}
                </div>
              </article>
            ))}

            {sending ? (
              <article className="chat-bubble chat-assistant">
                <span className="chat-role">Assistant</span>
                <div className="chat-message-body">
                  <p className="chat-heading">
                    Thinking through the current store data...
                  </p>
                  <div className="typing-dots" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </article>
            ) : null}

          </div>

          <form className="chat-form" onSubmit={handleSubmit}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about exact products, stock alerts, revenue windows, customers, or recent sales..."
              className="chat-input"
              rows="4"
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />

            {voiceStatus || voiceDraft ? (
              <div className={`chat-voice-panel${isListening ? " is-listening" : ""}`}>
                <p className="chat-voice-status">{voiceStatus}</p>
                {voiceDraft ? <p className="chat-voice-preview">{voiceDraft}</p> : null}
              </div>
            ) : null}

            <div className="chat-form-footer">
              <p className="muted-copy">
                Press Enter to send. Use Shift+Enter for a new line. Voice works best in Chrome or Edge.
              </p>
              <div className="chat-composer-actions">
                <button
                  type="button"
                  className={`button button-secondary chat-voice-button${
                    isListening ? " is-listening" : ""
                  }`}
                  onClick={handleVoiceToggle}
                  disabled={sending || !voiceSupported}
                  aria-pressed={isListening}
                  title={
                    voiceSupported
                      ? isListening
                        ? "Stop voice input"
                        : "Start voice input"
                      : "Voice input is not supported in this browser"
                  }
                >
                  {isListening ? "Stop voice" : "Start voice"}
                </button>
                <button
                  type="submit"
                  className="button button-primary"
                  disabled={sending}
                >
                  {sending ? "Sending..." : "Send question"}
                </button>
              </div>
            </div>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
