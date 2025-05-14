<template>
  <div class="app-container">
    <div class="header">
      <h1>Панель управления билдами</h1>
      <div class="server-status" v-if="isServerRunning">
        <span class="status-indicator active"></span>
        Сервер активен
      </div>
      <div class="server-status" v-else>
        <span class="status-indicator"></span>
        Сервер не запущен
      </div>
    </div>
    
    <div class="main-content">
      <StartPanel 
        v-if="!isServerRunning" 
        @start-server="startServer"
      />
      
      <div v-else class="terminal-container">
        <div class="sidebar">
          <h3>Подключенные клиенты</h3>
          <div class="client-count">{{ clients.length }} {{ getPluralForm(clients.length, ['клиент', 'клиента', 'клиентов']) }}</div>
          
          <div class="client-list" v-if="clients.length > 0">
            <button 
              v-for="client in clients" 
              :key="client" 
              @click="selectClient(client)"
              :class="['client-button', {'active': selectedClient === client}]"
            >
              {{ formatClientId(client) }}
            </button>
          </div>
          <div v-else class="no-clients">
            Ожидание подключений...
          </div>
        </div>
        
        <Terminal 
          v-if="selectedClient" 
          :client-id="selectedClient"
          @send-command="sendCommand"
          :command-history="getCommandHistory(selectedClient)"
        />
        <div v-else class="waiting-message">
          {{ clients.length > 0 ? 'Выберите клиент слева для управления' : 'Ожидание подключения клиентов...' }}
        </div>
      </div>
    </div>
    
    <div class="log-container">
      <div class="log-header">
        <h3>Лог сервера</h3>
        <button class="clear-log-btn" @click="clearLogs">Очистить</button>
      </div>
      <div class="log" ref="logContainer">
        <div v-for="(log, index) in serverLogs" :key="index" class="log-entry">
          {{ log }}
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import StartPanel from './components/StartPanel.vue';
import Terminal from './components/Terminal.vue';
import { socketService } from './services/socket';

export default {
  name: 'App',
  components: {
    StartPanel,
    Terminal
  },
  data() {
    return {
      isServerRunning: false,
      clients: [],
      selectedClient: null,
      serverLogs: [],
      commandHistory: {},
      maxLogEntries: 1000
    };
  },
  methods: {
    startServer() {
      socketService.startServer();
    },
    selectClient(clientId) {
      this.selectedClient = clientId;
      if (!this.commandHistory[clientId]) {
        this.commandHistory[clientId] = [];
      }
    },
    sendCommand(command) {
      if (this.selectedClient) {
        socketService.sendCommand(this.selectedClient, command);
        if (!this.commandHistory[this.selectedClient]) {
          this.commandHistory[this.selectedClient] = [];
        }
        this.commandHistory[this.selectedClient].push({
          type: 'command',
          text: command,
          timestamp: new Date().toISOString()
        });
      }
    },
    addLog(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.serverLogs.push(`[${timestamp}] ${message}`);
      
      if (this.serverLogs.length > this.maxLogEntries) {
        this.serverLogs = this.serverLogs.slice(-this.maxLogEntries);
      }
      
      this.$nextTick(() => {
        if (this.$refs.logContainer) {
          this.$refs.logContainer.scrollTop = this.$refs.logContainer.scrollHeight;
        }
      });
    },
    clearLogs() {
      this.serverLogs = [];
    },
    handleClientConnected(data) {
      if (!this.clients.includes(data.clientId)) {
        this.clients.push(data.clientId);
      }
      this.addLog(`Клиент подключен: ${data.clientId}`);
    },
    handleClientDisconnected(data) {
      const index = this.clients.indexOf(data.clientId);
      if (index !== -1) {
        this.clients.splice(index, 1);
      }
      if (this.selectedClient === data.clientId) {
        this.selectedClient = this.clients.length > 0 ? this.clients[0] : null;
      }
      this.addLog(`Клиент отключен: ${data.clientId}`);
    },
    handleCommandResponse(data) {
      if (data.clientId === this.selectedClient) {
        if (!this.commandHistory[this.selectedClient]) {
          this.commandHistory[this.selectedClient] = [];
        }
        this.commandHistory[this.selectedClient].push({
          type: 'response',
          text: data.response,
          timestamp: new Date().toISOString()
        });
      }
    },
    getCommandHistory(clientId) {
      return this.commandHistory[clientId] || [];
    },
    formatClientId(clientId) {
      if (!clientId) return '';
      const parts = clientId.split('-');
      if (parts.length !== 2) return clientId;
      
      return `${parts[0]}-${parts[1].substring(0, 8)}...`;
    },
    getPluralForm(number, forms) {
      const cases = [2, 0, 1, 1, 1, 2];
      return forms[
        (number % 100 > 4 && number % 100 < 20) 
          ? 2 
          : cases[Math.min(number % 10, 5)]
      ];
    }
  },
  created() {
    socketService.onServerStarted(() => {
      this.isServerRunning = true;
      this.addLog('Сервер запущен');
    });
    
    socketService.onLog((data) => {
      this.addLog(data.message);
    });
    
    socketService.onClientConnected((data) => {
      this.handleClientConnected(data);
    });
    
    socketService.onClientDisconnected((data) => {
      this.handleClientDisconnected(data);
    });
    
    socketService.onCommandResponse((data) => {
      this.handleCommandResponse(data);
    });
    
    socketService.checkStatus();
  },
  mounted() {
    document.addEventListener('keydown', (e) => {
      if (!this.isServerRunning || this.clients.length === 0) return;
      
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const currentIndex = this.clients.indexOf(this.selectedClient);
        let newIndex;
        
        if (e.key === 'ArrowUp') {
          newIndex = currentIndex <= 0 ? this.clients.length - 1 : currentIndex - 1;
        } else {
          newIndex = currentIndex >= this.clients.length - 1 ? 0 : currentIndex + 1;
        }
        
        this.selectClient(this.clients[newIndex]);
        e.preventDefault();
      }
    });
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown);
  }
};
</script>

<style>
:root {
  --primary-color: #2c3e50;
  --secondary-color: #34495e;
  --accent-color: #42b983;
  --danger-color: #e74c3c;
  --light-bg: #f9f9f9;
  --dark-bg: #232323;
  --border-color: #ddd;
  --text-color: #333;
  --text-light: #555;
  --text-dark: #111;
  --text-terminal: #ddd;
  --terminal-bg: #000;
  --header-height: 60px;
  --log-height: 200px;
  --transition-speed: 0.3s;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background-color: var(--light-bg);
  color: var(--text-color);
}

.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 10px;
  box-sizing: border-box;
}

.header {
  background-color: var(--primary-color);
  color: white;
  padding: 10px 20px;
  border-radius: 5px 5px 0 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: var(--header-height);
}

.header h1 {
  margin: 0;
  font-size: 24px;
}

.server-status {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.status-indicator {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: #666;
  margin-right: 8px;
}

.status-indicator.active {
  background-color: var(--accent-color);
  box-shadow: 0 0 5px var(--accent-color);
}

.main-content {
  flex: 1;
  background-color: white;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  margin: 10px 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.terminal-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.sidebar {
  width: 250px;
  background-color: var(--light-bg);
  border-right: 1px solid var(--border-color);
  padding: 15px;
  display: flex;
  flex-direction: column;
}

.sidebar h3 {
  margin: 0 0 10px 0;
  font-size: 16px;
  color: var(--text-dark);
}

.client-count {
  font-size: 14px;
  color: var(--text-light);
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
}

.client-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.client-button {
  padding: 10px;
  background-color: white;
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  text-align: left;
  transition: all var(--transition-speed);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.client-button:hover {
  background-color: #f0f0f0;
  border-color: #ccc;
}

.client-button.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.no-clients {
  color: var(--text-light);
  font-style: italic;
  text-align: center;
  margin-top: 20px;
}

.waiting-message {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  font-size: 18px;
  color: var(--text-light);
  text-align: center;
  padding: 20px;
}

.log-container {
  height: var(--log-height);
  background-color: var(--light-bg);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f0f0f0;
  border-bottom: 1px solid var(--border-color);
}

.log-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-dark);
}

.clear-log-btn {
  background-color: transparent;
  border: 1px solid var(--text-light);
  color: var(--text-light);
  padding: 3px 8px;
  font-size: 12px;
  border-radius: 3px;
  cursor: pointer;
  transition: all var(--transition-speed);
}

.clear-log-btn:hover {
  background-color: var(--danger-color);
  border-color: var(--danger-color);
  color: white;
}

.log {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 14px;
}

.log-entry {
  margin-bottom: 5px;
  color: var(--text-light);
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 768px) {
  .terminal-container {
    flex-direction: column;
  }
  
  .sidebar {
    width: 100%;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  
  .client-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 5px;
  }
  
  .client-button {
    flex: 0 0 auto;
    max-width: 45%;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    --primary-color: #1a2634;
    --secondary-color: #283747;
    --accent-color: #2ecc71;
    --danger-color: #c0392b;
    --light-bg: #2c3e50;
    --dark-bg: #1a1a1a;
    --border-color: #3a3a3a;
    --text-color: #ddd;
    --text-light: #bbb;
    --text-dark: #fff;
    --text-terminal: #ddd;
    --terminal-bg: #000;
  }
  
  body {
    background-color: var(--dark-bg);
  }
  
  .main-content {
    background-color: var(--secondary-color);
  }
  
  .sidebar {
    background-color: var(--primary-color);
  }
  
  .client-button {
    background-color: var(--secondary-color);
    border-color: var(--border-color);
    color: var(--text-color);
  }
  
  .client-button:hover {
    background-color: #354b60;
  }
  
  .log-container {
    background-color: var(--primary-color);
  }
  
  .log-header {
    background-color: var(--primary-color);
  }
}
</style>