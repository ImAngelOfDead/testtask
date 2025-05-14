<template>
  <div class="terminal">
    <div class="terminal-header">
      <div class="client-info">
        <span class="client-label">Подключен:</span>
        <span class="client-id">{{ clientId }}</span>
      </div>
      <div class="terminal-actions">
        <button class="terminal-action-btn" @click="clearTerminal" title="Очистить терминал">
          <span class="icon">⌧</span>
        </button>
      </div>
    </div>
    
    <div class="terminal-body" ref="terminalBody" @click="focusInput">
      <div class="terminal-content">
        <div 
          v-for="(item, index) in commandHistory" 
          :key="index" 
          :class="['terminal-line', item.type]"
        >
          <template v-if="item.type === 'command'">
            <span class="prompt">C:\&gt;</span> {{ item.text }}
          </template>
          <template v-else>
            <pre>{{ item.text }}</pre>
          </template>
        </div>
        
        <div class="terminal-input-line">
          <span class="prompt">C:\&gt;</span>
          <input 
            type="text" 
            v-model="currentCommand" 
            @keydown="handleKeyDown" 
            @keyup.enter="sendCommand" 
            ref="commandInput"
            class="terminal-input"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
      </div>
    </div>
    
    <div class="terminal-footer">
      <div class="terminal-hint">
        <span class="hint-key">↑/↓</span> - история команд
        <span class="hint-key">Tab</span> - автодополнение
        <span class="hint-key">Ctrl+L</span> - очистить экран
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Terminal',
  props: {
    clientId: {
      type: String,
      required: true
    },
    commandHistory: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      currentCommand: '',
      commandHistoryIndex: -1,
      tempCommand: '',
      commandHistoryLocal: [],
      autoCompleteSuggestions: [],
      autoCompleteIndex: -1,
      commonCommands: [
        'dir', 'cd', 'type', 'systeminfo', 'help', 'ipconfig', 
        'tasklist', 'echo', 'hostname', 'whoami', 'net', 'netstat',
        'ping', 'tracert', 'cls', 'powershell', 'cmd', 'exit'
      ]
    };
  },
  methods: {
    sendCommand() {
      if (this.currentCommand.trim() === '') return;
      
      this.addToLocalHistory(this.currentCommand);
      
      this.$emit('send-command', this.currentCommand);
      this.currentCommand = '';
      
      this.commandHistoryIndex = -1;
    },
    handleKeyDown(event) {
      if (event.key === 'ArrowUp') {
        this.navigateHistory(-1);
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        this.navigateHistory(1);
        event.preventDefault();
      } else if (event.key === 'Tab') {
        this.handleTabCompletion();
        event.preventDefault();
      } else if (event.key === 'l' && event.ctrlKey) {
        this.clearTerminal();
        event.preventDefault();
      }
    },
    navigateHistory(direction) {
      if (this.commandHistoryLocal.length === 0) return;
      
      if (this.commandHistoryIndex === -1 && direction === -1) {
        this.tempCommand = this.currentCommand;
      }
      
      const newIndex = this.commandHistoryIndex + direction;
      
      if (newIndex >= -1 && newIndex < this.commandHistoryLocal.length) {
        this.commandHistoryIndex = newIndex;
        
        if (newIndex === -1) {
          this.currentCommand = this.tempCommand;
        } else {
          this.currentCommand = this.commandHistoryLocal[this.commandHistoryIndex];
        }
      }
    },
    handleTabCompletion() {
      if (this.currentCommand.trim() === '') return;
      
      if (this.autoCompleteSuggestions.length === 0) {
        const commandPrefix = this.currentCommand.toLowerCase();
        
        this.autoCompleteSuggestions = this.commonCommands
          .filter(cmd => cmd.toLowerCase().startsWith(commandPrefix))
          .concat(
            this.commandHistoryLocal
              .filter(cmd => cmd.toLowerCase().startsWith(commandPrefix) && 
                             !this.commonCommands.includes(cmd))
          );
        
        this.autoCompleteSuggestions = [...new Set(this.autoCompleteSuggestions)];
        this.autoCompleteIndex = 0;
      } else {
        this.autoCompleteIndex = (this.autoCompleteIndex + 1) % this.autoCompleteSuggestions.length;
      }
      
      if (this.autoCompleteSuggestions.length > 0) {
        this.currentCommand = this.autoCompleteSuggestions[this.autoCompleteIndex];
      }
    },
    addToLocalHistory(command) {
      if (this.commandHistoryLocal.length > 0 && 
          this.commandHistoryLocal[0] === command) {
        return;
      }
      
      this.commandHistoryLocal.unshift(command);
      
      if (this.commandHistoryLocal.length > 50) {
        this.commandHistoryLocal.pop();
      }
    },
    clearTerminal() {
      this.$emit('clear-terminal');
    },
    scrollToBottom() {
      this.$nextTick(() => {
        if (this.$refs.terminalBody) {
          this.$refs.terminalBody.scrollTop = this.$refs.terminalBody.scrollHeight;
        }
      });
    },
    focusInput() {
      this.$nextTick(() => {
        if (this.$refs.commandInput) {
          this.$refs.commandInput.focus();
        }
      });
    },
    resetAutoComplete() {
      this.autoCompleteSuggestions = [];
      this.autoCompleteIndex = -1;
    }
  },
  watch: {
    commandHistory: {
      handler() {
        this.scrollToBottom();
      },
      deep: true
    },
    currentCommand() {
      this.resetAutoComplete();
    },
    clientId() {
      this.currentCommand = '';
      this.commandHistoryIndex = -1;
      this.focusInput();
    }
  },
  mounted() {
    this.focusInput();
    
    this.$refs.terminalBody.addEventListener('click', this.focusInput);
    
    const savedHistory = localStorage.getItem('terminal_command_history');
    if (savedHistory) {
      try {
        this.commandHistoryLocal = JSON.parse(savedHistory);
      } catch (e) {
        console.error('Ошибка при загрузке истории команд:', e);
        this.commandHistoryLocal = [];
      }
    }
  },
  beforeUnmount() {
    if (this.$refs.terminalBody) {
      this.$refs.terminalBody.removeEventListener('click', this.focusInput);
    }
    
    localStorage.setItem('terminal_command_history', JSON.stringify(this.commandHistoryLocal));
  }
};
</script>

<style scoped>
.terminal {
  display: flex;
  flex-direction: column;
  height: 100%;
  border: 1px solid #444;
  border-radius: 5px;
  overflow: hidden;
  background-color: #000;
  color: #ccc;
  font-family: 'Consolas', 'Courier New', monospace;
  flex: 1;
}

.terminal-header {
  padding: 8px 12px;
  background-color: #222;
  border-bottom: 1px solid #444;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.client-info {
  font-size: 14px;
  color: #ddd;
  display: flex;
  align-items: center;
  gap: 5px;
}

.client-label {
  color: #888;
}

.client-id {
  color: #eee;
  font-weight: bold;
}

.terminal-actions {
  display: flex;
  gap: 5px;
}

.terminal-action-btn {
  background-color: transparent;
  border: none;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  padding: 2px 4px;
  transition: color 0.2s;
}

.terminal-action-btn:hover {
  color: #fff;
}

.icon {
  display: inline-block;
  font-family: Arial, sans-serif;
}

.terminal-body {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  position: relative;
}

.terminal-content {
  min-height: 100%;
}

.terminal-line {
  margin-bottom: 5px;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal-line.command {
  color: #fff;
}

.terminal-line.response {
  color: #ccc;
}

.terminal-input-line {
  display: flex;
  align-items: flex-start;
}

.prompt {
  color: #0f0;
  margin-right: 5px;
  white-space: nowrap;
  user-select: none;
}

.terminal-input {
  flex: 1;
  background-color: transparent;
  border: none;
  color: #fff;
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: inherit;
  outline: none;
  padding: 0;
  margin: 0;
  width: 100%;
  caret-color: #0f0;
}

pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
}

.terminal-footer {
  padding: 5px 10px;
  background-color: #222;
  border-top: 1px solid #444;
  font-size: 12px;
  color: #666;
  user-select: none;
}

.terminal-hint {
  display: flex;
  justify-content: center;
  gap: 15px;
}

.hint-key {
  background-color: #333;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid #555;
  color: #aaa;
  font-weight: bold;
  margin-right: 3px;
}

@media (prefers-color-scheme: dark) {
  .terminal-header {
    background-color: #1a1a1a;
  }
  
  .terminal-footer {
    background-color: #1a1a1a;
  }
}
</style>