const socketService = {
  callbacks: {
    serverStarted: [],
    log: [],
    clientConnected: [],
    clientDisconnected: [],
    commandResponse: []
  },
  
  eventSource: null,
  
  connected: false,
  
  reconnectTimeout: 3000,
  maxReconnectTimeout: 30000,
  currentReconnectTimeout: 3000,
  
  startServer() {
    return fetch('/api/start-server', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        this._triggerCallbacks('serverStarted');
        return true;
      } else {
        this._triggerCallbacks('log', data.error || 'Ошибка запуска сервера');
        return false;
      }
    })
    .catch(error => {
      this._triggerCallbacks('log', `Ошибка запуска сервера: ${error.message}`);
      return false;
    });
  },
  
  sendCommand(clientId, command) {
    return fetch('/api/send-command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clientId,
        command
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (!data.success) {
        this._triggerCallbacks('log', data.error || 'Ошибка отправки команды');
        return false;
      }
      return true;
    })
    .catch(error => {
      this._triggerCallbacks('log', `Ошибка отправки команды: ${error.message}`);
      return false;
    });
  },
  
  checkStatus() {
    return fetch('/api/status')
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success && data.status.isRunning) {
          this._triggerCallbacks('serverStarted');
          
          data.status.clients.forEach(clientId => {
            this._triggerCallbacks('clientConnected', { clientId });
          });
        }
        return data.status;
      })
      .catch(error => {
        console.error('Ошибка проверки статуса сервера:', error);
        return { isRunning: false };
      });
  },
  
  init() {
    this._connectEventSource();
    
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.connected) {
        this._connectEventSource();
      }
    });
    
    setInterval(() => {
      if (!this.connected) {
        this._connectEventSource();
      }
    }, 60000);
  },
  
  _connectEventSource() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    this.eventSource = new EventSource('/api/events');
    
    this.eventSource.addEventListener('open', () => {
      this.connected = true;
      this.currentReconnectTimeout = this.reconnectTimeout;
      console.log('SSE подключение установлено');
    });
    
    this.eventSource.addEventListener('server-started', (event) => {
      this._triggerCallbacks('serverStarted');
    });
    
    this.eventSource.addEventListener('log', (event) => {
      try {
        const data = JSON.parse(event.data);
        this._triggerCallbacks('log', data.message);
      } catch (error) {
        console.error('Ошибка разбора сообщения лога:', error);
      }
    });
    
    this.eventSource.addEventListener('client-connected', (event) => {
      try {
        const data = JSON.parse(event.data);
        this._triggerCallbacks('clientConnected', data);
      } catch (error) {
        console.error('Ошибка разбора сообщения о подключении клиента:', error);
      }
    });
    
    this.eventSource.addEventListener('client-disconnected', (event) => {
      try {
        const data = JSON.parse(event.data);
        this._triggerCallbacks('clientDisconnected', data);
      } catch (error) {
        console.error('Ошибка разбора сообщения об отключении клиента:', error);
      }
    });
    
    this.eventSource.addEventListener('command-response', (event) => {
      try {
        const data = JSON.parse(event.data);
        this._triggerCallbacks('commandResponse', data);
      } catch (error) {
        console.error('Ошибка разбора ответа команды:', error);
      }
    });
    
    this.eventSource.addEventListener('error', (event) => {
      this.connected = false;
      console.warn('Ошибка SSE подключения. Повторное подключение...');
      
      this.eventSource.close();
      this.eventSource = null;
      
      setTimeout(() => {
        this._connectEventSource();
      }, this.currentReconnectTimeout);
      
      this.currentReconnectTimeout = Math.min(
        this.currentReconnectTimeout * 1.5,
        this.maxReconnectTimeout
      );
    });
  },
  
  onServerStarted(callback) {
    this.callbacks.serverStarted.push(callback);
    return () => this._removeCallback('serverStarted', callback);
  },
  
  onLog(callback) {
    this.callbacks.log.push(callback);
    return () => this._removeCallback('log', callback);
  },
  
  onClientConnected(callback) {
    this.callbacks.clientConnected.push(callback);
    return () => this._removeCallback('clientConnected', callback);
  },
  
  onClientDisconnected(callback) {
    this.callbacks.clientDisconnected.push(callback);
    return () => this._removeCallback('clientDisconnected', callback);
  },
  
  onCommandResponse(callback) {
    this.callbacks.commandResponse.push(callback);
    return () => this._removeCallback('commandResponse', callback);
  },
  
  _removeCallback(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }
  },
  
  _triggerCallbacks(event, data) {
    if (this.callbacks[event]) {
      this.callbacks[event].forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Ошибка в обработчике события ${event}:`, error);
        }
      });
    }
  }
};

socketService.init();

export { socketService };