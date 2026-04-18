// Chat Widget Flutuante para Jurysone
(function() {
  // Criar container do widget
  const createChatWidget = () => {
    const container = document.createElement('div');
    container.id = 'jus-chat-widget';
    container.innerHTML = `
      <style>
        #jus-chat-widget {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 9999;
          font-family: 'Inter', sans-serif;
        }

        #jus-chat-button {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #0f2d5e 0%, #1a3a7a 100%);
          color: white;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          box-shadow: 0 4px 16px rgba(15, 45, 94, 0.35);
          transition: all 0.3s ease;
        }

        #jus-chat-button:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(15, 45, 94, 0.45);
        }

        #jus-chat-button.open {
          background: linear-gradient(135deg, #1a3a7a 0%, #0f2d5e 100%);
        }

        #jus-chat-window {
          display: none;
          position: absolute;
          bottom: 80px;
          right: 0;
          width: 380px;
          height: 500px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 5px 40px rgba(0, 0, 0, 0.16);
          flex-direction: column;
          animation: slideUp 0.3s ease;
          z-index: 9998;
        }

        #jus-chat-window.open {
          display: flex;
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .chat-header {
          background: linear-gradient(135deg, #0f2d5e 0%, #1a3a7a 100%);
          color: white;
          padding: 20px;
          border-radius: 12px 12px 0 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .chat-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }

        .chat-close {
          background: none;
          border: none;
          color: white;
          cursor: pointer;
          font-size: 20px;
        }

        .chat-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .chat-message {
          display: flex;
          gap: 8px;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .message-bot {
          justify-content: flex-start;
        }

        .message-user {
          justify-content: flex-end;
        }

        .message-content {
          max-width: 70%;
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.4;
        }

        .message-bot .message-content {
          background: #f1f5f9;
          color: #334155;
        }

        .message-user .message-content {
          background: linear-gradient(135deg, #0f2d5e 0%, #1a3a7a 100%);
          color: white;
        }

        .chat-footer {
          padding: 12px;
          border-top: 1px solid #e2e8f0;
          display: flex;
          gap: 8px;
        }

        .chat-input {
          flex: 1;
          padding: 10px 12px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 13px;
          font-family: 'Inter', sans-serif;
          transition: border-color 0.2s;
        }

        .chat-input:focus {
          outline: none;
          border-color: #0f2d5e;
          box-shadow: 0 0 0 3px rgba(15, 45, 94, 0.1);
        }

        .chat-send {
          background: linear-gradient(135deg, #0f2d5e 0%, #1a3a7a 100%);
          color: white;
          border: none;
          border-radius: 8px;
          padding: 10px 14px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .chat-send:hover {
          transform: scale(1.05);
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 8px;
        }

        .typing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #cbd5e1;
          animation: typing 1.4s infinite;
        }

        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-10px); }
        }

        @media (max-width: 480px) {
          #jus-chat-window {
            width: calc(100vw - 32px);
            height: 60vh;
            right: 16px;
            bottom: 80px;
          }
        }
      </style>

      <button id="jus-chat-button" title="Abrir chat">💬</button>

      <div id="jus-chat-window">
        <div class="chat-header">
          <h3>Chat Jurysone</h3>
          <button class="chat-close">✕</button>
        </div>
        <div class="chat-body" id="jus-chat-messages">
          <div class="chat-message message-bot">
            <div class="message-content">
              Olá! 👋 Como posso ajudar você com a Jurysone?
            </div>
          </div>
        </div>
        <div class="chat-footer">
          <input
            type="text"
            class="chat-input"
            id="jus-chat-input"
            placeholder="Digite sua mensagem..."
            autocomplete="off"
          >
          <button class="chat-send">📤</button>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Event listeners
    const button = document.getElementById('jus-chat-button');
    const window_ = document.getElementById('jus-chat-window');
    const closeBtn = window_.querySelector('.chat-close');
    const input = document.getElementById('jus-chat-input');
    const sendBtn = window_.querySelector('.chat-send');
    const messagesContainer = document.getElementById('jus-chat-messages');

    button.addEventListener('click', () => {
      button.classList.toggle('open');
      window_.classList.toggle('open');
      if (window_.classList.contains('open')) {
        input.focus();
      }
    });

    closeBtn.addEventListener('click', () => {
      button.classList.remove('open');
      window_.classList.remove('open');
    });

    const sendMessage = () => {
      const text = input.value.trim();
      if (!text) return;

      // Adicionar mensagem do usuário
      const userMsg = document.createElement('div');
      userMsg.className = 'chat-message message-user';
      userMsg.innerHTML = `<div class="message-content">${escapeHtml(text)}</div>`;
      messagesContainer.appendChild(userMsg);

      input.value = '';
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Simular resposta do bot
      setTimeout(() => {
        const typing = document.createElement('div');
        typing.className = 'chat-message message-bot';
        typing.innerHTML = `
          <div class="typing-indicator">
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
          </div>
        `;
        messagesContainer.appendChild(typing);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        setTimeout(() => {
          typing.remove();
          const botMsg = document.createElement('div');
          botMsg.className = 'chat-message message-bot';
          botMsg.innerHTML = `<div class="message-content">${getBotResponse(text)}</div>`;
          messagesContainer.appendChild(botMsg);
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 1500);
      }, 300);
    };

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  };

  // Respostas automáticas do bot
  const getBotResponse = (msg) => {
    const responses = {
      'oi': 'Olá! Bem-vindo à Jurysone! 👋',
      'olá': 'Oi! Como posso ajudar você?',
      'ajuda': 'Estou aqui para ajudar! Você pode:\n• Acessar seu dashboard\n• Consultar processos\n• Gerenciar clientes\n• Ver sua agenda',
      'processos': 'Para acessar seus processos, clique em "⚖️ Processos" na barra lateral',
      'clientes': 'Clique em "👥 Clientes" para gerenciar seus clientes',
      'agenda': 'Visite "📅 Agenda" para ver seus compromissos agendados',
      'documentos': 'Você pode consultar seus documentos em "📚 Modelos"',
    };

    const lower = msg.toLowerCase();
    for (const [key, response] of Object.entries(responses)) {
      if (lower.includes(key)) return response;
    }

    return 'Interessante! Para mais informações, navegue pelo dashboard ou entre em contato com nosso suporte.';
  };

  // Escape HTML
  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Inicializar quando o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createChatWidget);
  } else {
    createChatWidget();
  }
})();
