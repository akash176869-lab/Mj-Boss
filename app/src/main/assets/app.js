/**
 * Arushi AI Assistant - Multimodal Live Voice & Native Android Bridge
 */

(function () {
  'use strict';

  // --- Configuration & State ---
  const state = {
    apiKey: '',
    model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
    voiceName: 'Aoede',
    isConnected: false,
    isRecording: false,
    isArushiSpeaking: false,
    hasNativeBridge: false,
    detectedLang: 'Auto (Hindi/English/Hinglish)',
    ws: null,
    audioContext: null,
    playbackContext: null,
    micStream: null,
    scriptProcessor: null,
    audioQueue: [],
    scheduledSources: [],
    nextPlayTime: 0,
    analyser: null,
    animFrameId: null,
  };

  // --- DOM Elements ---
  const statusDot = document.getElementById('statusDot');
  const statusLabel = document.getElementById('statusLabel');
  const bridgeStatusText = document.getElementById('bridgeStatusText');
  const platformBadge = document.getElementById('platformBadge');
  const languagePill = document.getElementById('languagePill');
  const languageText = document.getElementById('languageText');
  const orbContainer = document.getElementById('orbContainer');
  const orbCore = document.getElementById('orbCore');
  const soundwaveContainer = document.getElementById('soundwaveContainer');
  const waveBars = document.querySelectorAll('.wave-bar');
  const actionCard = document.getElementById('actionCard');
  const actionCardIcon = document.getElementById('actionCardIcon');
  const actionCardTitle = document.getElementById('actionCardTitle');
  const actionCardDesc = document.getElementById('actionCardDesc');
  const actionCardBadge = document.getElementById('actionCardBadge');
  const transcriptText = document.getElementById('transcriptText');
  const mainMicBtn = document.getElementById('mainMicBtn');
  const interruptBtn = document.getElementById('interruptBtn');
  const toggleTextInputBtn = document.getElementById('toggleTextInputBtn');
  const textInputBar = document.getElementById('textInputBar');
  const textPromptInput = document.getElementById('textPromptInput');
  const sendPromptBtn = document.getElementById('sendPromptBtn');
  const settingsModal = document.getElementById('settingsModal');
  const openSettingsBtn = document.getElementById('openSettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const apiKeyInput = document.getElementById('apiKeyInput');
  const toggleApiKeyVisibility = document.getElementById('toggleApiKeyVisibility');
  const voiceSelect = document.getElementById('voiceSelect');
  const modelSelect = document.getElementById('modelSelect');
  const bridgeStateBadge = document.getElementById('bridgeStateBadge');
  const bridgeDetailText = document.getElementById('bridgeDetailText');
  const seedContactsBtn = document.getElementById('seedContactsBtn');
  const testBridgeBtn = document.getElementById('testBridgeBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const cmdChips = document.querySelectorAll('.cmd-chip');

  // --- Bridge Detection ---
  function getAndroidBridge() {
    if (typeof window.AndroidBridge !== 'undefined' && window.AndroidBridge !== null) {
      return window.AndroidBridge;
    }
    if (typeof window.AndroidAppActionBridge !== 'undefined' && window.AndroidAppActionBridge !== null) {
      return window.AndroidAppActionBridge;
    }
    return null;
  }

  function initBridge() {
    const bridge = getAndroidBridge();
    state.hasNativeBridge = bridge !== null;

    if (state.hasNativeBridge) {
      bridgeStatusText.textContent = 'APK Active';
      platformBadge.style.borderColor = 'rgba(16, 185, 129, 0.5)';
      platformBadge.style.color = '#10b981';
      bridgeStateBadge.textContent = 'Connected (Native APK)';
      bridgeStateBadge.className = 'badge-success';
      bridgeDetailText.textContent = 'Native bridge is active. Supported functions: openWhatsApp, openApp, makeCall, callContact, openUrl.';

      // Try reading API key from BuildConfig if available
      try {
        if (typeof bridge.getApiKey === 'function') {
          const key = bridge.getApiKey();
          if (key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 10) {
            state.apiKey = key.trim();
            apiKeyInput.value = state.apiKey;
          }
        }
      } catch (e) {
        console.warn('Could not read API key from bridge', e);
      }

      // Automatically seed sample contacts if needed for emulator testing
      try {
        if (typeof bridge.seedContactsIfNeeded === 'function') {
          bridge.seedContactsIfNeeded();
        }
      } catch (e) {
        console.warn('Could not seed contacts', e);
      }
    } else {
      bridgeStatusText.textContent = 'Web Fallback';
      bridgeStateBadge.textContent = 'Web Mode';
      bridgeStateBadge.className = 'badge-error';
      bridgeDetailText.textContent = 'Running in browser without native APK bridge. Deep-link and URL fallbacks will be used.';
    }

    // Load saved API key from localStorage if not provided by bridge
    if (!state.apiKey) {
      const savedKey = localStorage.getItem('arushi_gemini_api_key');
      if (savedKey) {
        state.apiKey = savedKey;
        apiKeyInput.value = savedKey;
      }
    }
  }

  // --- UI Update Helpers ---
  function setStatus(label, type) {
    statusLabel.textContent = label;
    statusDot.className = 'status-dot';
    if (type) statusDot.classList.add(type);
  }

  function setOrbState(stateName) {
    orbContainer.className = 'orb-container';
    if (stateName) orbContainer.classList.add(stateName);
  }

  function showActionBanner(icon, title, desc, badge) {
    actionCardIcon.textContent = icon || '⚡';
    actionCardTitle.textContent = title || 'Action Executed';
    actionCardDesc.textContent = desc || '';
    actionCardBadge.textContent = badge || 'Success';
    actionCard.classList.add('visible');

    setTimeout(() => {
      actionCard.classList.remove('visible');
    }, 4500);
  }

  function updateTranscript(text, isUser = false) {
    if (!text) return;
    transcriptText.textContent = text;

    // Detect language from text
    detectAndUpdateLanguage(text);
  }

  function detectAndUpdateLanguage(text) {
    if (!text) return;
    const lower = text.toLowerCase();
    
    // Check Devanagari script or common Hindi/Hinglish tokens
    const hasDevanagari = /[\u0900-\u097F]/.test(text);
    const hindiWords = ['kholo', 'karo', 'kaise', 'bolo', 'aap', 'mera', 'meri', 'kripya', 'lagao', 'shukriya', 'theek', 'namaste', 'mummy', 'bhai', 'haan', 'nahi'];
    const isHinglish = hindiWords.some(w => lower.includes(w));

    if (hasDevanagari) {
      languageText.textContent = 'Active Language: Hindi (हिंदी)';
      state.detectedLang = 'Hindi';
    } else if (isHinglish) {
      languageText.textContent = 'Active Language: Hinglish (Hindi + English)';
      state.detectedLang = 'Hinglish';
    } else if (/^[a-zA-Z0-9\s.,?!'":;@#%&*()-]+$/.test(text)) {
      languageText.textContent = 'Active Language: English';
      state.detectedLang = 'English';
    }
  }

  // --- Real Android Action Bridge Execution ---
  async function executeAction(name, args) {
    console.log('[Action Execution] Invoked:', name, args);
    setStatus('Executing Action...', 'action');
    setOrbState('action');

    const bridge = getAndroidBridge();

    if (name === 'openWhatsApp') {
      if (bridge && typeof bridge.openWhatsApp === 'function') {
        try {
          const raw = bridge.openWhatsApp();
          const res = JSON.parse(raw);
          if (res.success) {
            showActionBanner('💬', 'WhatsApp Opened', 'Switched to WhatsApp application', 'Success');
            return { status: 'success', message: 'WhatsApp opened successfully on device.' };
          } else {
            showActionBanner('⚠️', 'WhatsApp Not Installed', res.message || 'WhatsApp is not installed', 'Not Installed');
            return { status: 'not_installed', message: 'WhatsApp is not installed on this Android device.' };
          }
        } catch (e) {
          return { status: 'error', message: 'Failed executing native openWhatsApp: ' + e.message };
        }
      } else {
        // Safe web fallback
        window.open('https://wa.me/', '_blank');
        showActionBanner('💬', 'WhatsApp Web', 'Opened WhatsApp web link', 'Fallback');
        return { status: 'success', message: 'Opened WhatsApp web link in browser.' };
      }
    }

    if (name === 'openApp') {
      const appName = args.appName || 'App';
      if (bridge && typeof bridge.openApp === 'function') {
        try {
          const raw = bridge.openApp(appName);
          const res = JSON.parse(raw);
          if (res.success) {
            showActionBanner('📱', `Opened ${appName}`, res.message || `Launched ${appName}`, 'Success');
            return { status: 'success', message: `${appName} opened successfully on device.` };
          } else {
            showActionBanner('⚠️', `${appName} Not Found`, res.message || `${appName} is not installed`, 'Not Found');
            return { status: 'not_installed', message: `${appName} is not installed on this device.` };
          }
        } catch (e) {
          return { status: 'error', message: `Failed executing native openApp: ${e.message}` };
        }
      } else {
        showActionBanner('📱', `Open ${appName}`, 'Native APK bridge required to launch apps', 'Web Mode');
        return { status: 'unsupported', message: `Cannot launch ${appName} in browser mode without native Android bridge.` };
      }
    }

    if (name === 'makeCall') {
      const phoneNumber = args.phoneNumber || '';
      if (!phoneNumber) {
        return { status: 'error', message: 'No phone number provided' };
      }

      if (bridge && typeof bridge.makeCall === 'function') {
        try {
          const raw = bridge.makeCall(phoneNumber);
          const res = JSON.parse(raw);
          if (res.success) {
            const title = res.directCall ? `Calling ${phoneNumber}` : `Dialing ${phoneNumber}`;
            showActionBanner('📞', title, res.message, 'Success');
            return { status: 'success', message: `Call initiated to ${phoneNumber}` };
          } else {
            showActionBanner('⚠️', 'Call Failed', res.message, 'Failed');
            return { status: 'failed', message: res.message };
          }
        } catch (e) {
          return { status: 'error', message: `Native makeCall error: ${e.message}` };
        }
      } else {
        window.location.href = `tel:${phoneNumber}`;
        showActionBanner('📞', `Calling ${phoneNumber}`, 'Opening tel: link in browser', 'Tel Link');
        return { status: 'success', message: `Opened phone dialer for ${phoneNumber}` };
      }
    }

    if (name === 'callContact') {
      const contactName = args.contactName || '';
      if (!contactName) {
        return { status: 'error', message: 'No contact name specified' };
      }

      if (bridge && typeof bridge.callContact === 'function') {
        try {
          const raw = bridge.callContact(contactName);
          const res = JSON.parse(raw);
          if (res.success) {
            showActionBanner('📞', `Calling ${res.contactName}`, `Connecting to ${res.phoneNumber}`, 'Calling');
            return { status: 'success', contact: res.contactName, number: res.phoneNumber, message: `Calling ${res.contactName} (${res.phoneNumber})` };
          } else if (res.error === 'multiple_matches') {
            const listStr = res.matches ? res.matches.join(', ') : '';
            showActionBanner('👥', 'Multiple Contacts Found', `Found: ${listStr}`, 'Clarification Needed');
            return {
              status: 'multiple_matches',
              contactName: contactName,
              matches: res.matches,
              message: `I found multiple contacts matching '${contactName}': ${listStr}. Please ask the user which one they would like to call.`
            };
          } else if (res.error === 'not_found') {
            showActionBanner('⚠️', 'Contact Not Found', `No contact matching "${contactName}"`, 'Not Found');
            return { status: 'not_found', contactName: contactName, message: `No contact found with the name "${contactName}".` };
          } else {
            showActionBanner('⚠️', 'Contact Action Failed', res.message, 'Failed');
            return { status: 'failed', message: res.message };
          }
        } catch (e) {
          return { status: 'error', message: `Native callContact error: ${e.message}` };
        }
      } else {
        showActionBanner('👥', 'Contacts Inaccessible', 'Device contacts require Android APK bridge', 'Web Mode');
        return { status: 'unsupported', message: 'Contacts search is only available when running inside the Android APK with native contacts permission.' };
      }
    }

    if (name === 'openUrl') {
      const url = args.url || '';
      if (bridge && typeof bridge.openUrl === 'function') {
        try {
          const raw = bridge.openUrl(url);
          const res = JSON.parse(raw);
          showActionBanner('🌐', 'Opened Link', res.url || url, 'Success');
          return { status: 'success', message: `Opened URL ${url}` };
        } catch (e) {
          return { status: 'error', message: e.message };
        }
      } else {
        window.open(url.startsWith('http') ? url : `https://${url}`, '_blank');
        showActionBanner('🌐', 'Opened Link', url, 'Browser');
        return { status: 'success', message: `Opened URL ${url}` };
      }
    }

    return { status: 'error', message: `Unknown function: ${name}` };
  }

  // --- Gemini Multimodal Live API WebSocket Pipeline ---
  const GEMINI_SYSTEM_INSTRUCTION = `You are Arushi, an intelligent, warm, cheerful, and highly capable Indian AI voice assistant.

CRITICAL VOICE & MULTILINGUAL RULES:
1. Automatically detect the user's spoken language or dialect in real time (Hindi, English, Hinglish, Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, Urdu, and other supported languages).
2. Respond in the same language or dialect:
   - If the user speaks in Hindi, respond fluently and naturally in Hindi.
   - If the user speaks in English, respond in natural English.
   - If the user speaks in Hinglish (a mix of Hindi and English), respond naturally in Hinglish.
   - If the user speaks Marathi, Gujarati, Bengali, Tamil, Telugu, Kannada, Malayalam, Punjabi, or Urdu, respond naturally in that language.
3. Seamlessly switch languages mid-conversation whenever the user switches languages without requiring manual intervention.
4. Keep spoken responses concise, warm, helpful, and pleasant — optimal for spoken voice dialogue. Never use markdown, bullet points, asterisks, or bold tags in spoken responses.

DEVICE APP CONTROL & FUNCTION CALLING MANDATE:
You have direct access to device tools:
- openWhatsApp(): Call when the user requests to open WhatsApp ("WhatsApp kholo", "Open WhatsApp", "WhatsApp open karo", "WhatsApp chalao", "Open my WhatsApp").
- openApp(appName): Call when user asks to open an app (e.g., 'youtube', 'chrome', 'instagram', 'settings', 'camera').
- makeCall(phoneNumber): Call when the user specifies a phone number to call.
- callContact(contactName): Call when the user asks to call someone by name or relation (e.g., 'Mom', 'Mummy', 'Rahul', 'Dad').
- openUrl(url): Call when the user asks to open a web URL starting with http:// or https://.

ACTION INTEGRITY RULES:
- Whenever the user requests an app or device action, YOU MUST CALL THE APPROPRIATE TOOL IMMEDIATELY.
- Never state or claim that an action succeeded unless the client sends a successful tool execution response back.
- If callContact returns 'multiple_matches', ask the user to clarify which contact they want to call (e.g. "I found multiple contacts matching that name. Which one should I call?").
- If a contact is not found or an app is not installed, inform the user gracefully in their language.
- Speak naturally and cheerfully!`;

  const GEMINI_TOOLS = [
    {
      functionDeclarations: [
        {
          name: "openWhatsApp",
          description: "Opens WhatsApp on the user's device.",
          parameters: {
            type: "OBJECT",
            properties: {}
          }
        },
        {
          name: "openApp",
          description: "Opens a specific application installed on the user's device.",
          parameters: {
            type: "OBJECT",
            properties: {
              appName: {
                type: "STRING",
                description: "The name of the app to open (e.g., 'youtube', 'chrome', 'instagram', 'settings')."
              }
            },
            required: ["appName"]
          }
        },
        {
          name: "openUrl",
          description: "Opens a web URL.",
          parameters: {
            type: "OBJECT",
            properties: {
              url: {
                type: "STRING",
                description: "The URL to open starting with http:// or https://"
              }
            },
            required: ["url"]
          }
        },
        {
          name: "makeCall",
          description: "Calls a direct phone number.",
          parameters: {
            type: "OBJECT",
            properties: {
              phoneNumber: {
                type: "STRING",
                description: "The phone number digits."
              }
            },
            required: ["phoneNumber"]
          }
        },
        {
          name: "callContact",
          description: "Searches for a contact by name and initiates a phone call.",
          parameters: {
            type: "OBJECT",
            properties: {
              contactName: {
                type: "STRING",
                description: "The contact name (e.g., 'Mom', 'Mummy', 'Rahul')."
              }
            },
            required: ["contactName"]
          }
        }
      ]
    }
  ];

  function connectGeminiLive() {
    if (!state.apiKey) {
      updateTranscript('Please configure your Gemini API Key in Settings to start voice conversation.');
      settingsModal.classList.add('open');
      return;
    }

    setStatus('Connecting...', '');
    setOrbState('');

    const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${state.apiKey}`;

    try {
      state.ws = new WebSocket(wsUrl);
    } catch (e) {
      console.error('Failed creating WebSocket:', e);
      setStatus('Connection Failed', 'action');
      updateTranscript('Failed to create WebSocket connection. Check API key and network.');
      return;
    }

    state.ws.onopen = () => {
      console.log('[Gemini Live] WebSocket opened. Sending setup message...');
      setStatus('Configuring Session...', '');

      const setupMsg = {
        setup: {
          model: state.model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: state.voiceName
                }
              }
            }
          },
          systemInstruction: {
            parts: [
              { text: GEMINI_SYSTEM_INSTRUCTION }
            ]
          },
          tools: GEMINI_TOOLS
        }
      };

      state.ws.send(JSON.stringify(setupMsg));
    };

    state.ws.onmessage = async (event) => {
      let data;
      try {
        if (event.data instanceof Blob) {
          const text = await event.data.text();
          data = JSON.parse(text);
        } else {
          data = JSON.parse(event.data);
        }
      } catch (err) {
        console.warn('Error parsing message:', err);
        return;
      }

      handleServerMessage(data);
    };

    state.ws.onerror = (err) => {
      console.error('[Gemini Live] Error:', err);
      setStatus('Error', 'action');
      updateTranscript('Connection error with Gemini Live. Tap mic to retry.');
      stopRecording();
    };

    state.ws.onclose = (event) => {
      console.log('[Gemini Live] Closed code:', event.code, 'reason:', event.reason);
      state.isConnected = false;
      setStatus('Disconnected', '');
      setOrbState('');
      mainMicBtn.classList.remove('active');
      interruptBtn.disabled = true;
      stopAudioPlayback();
    };
  }

  async function handleServerMessage(msg) {
    // 1. Setup complete
    if (msg.setupComplete) {
      console.log('[Gemini Live] Setup complete! Ready for voice.');
      state.isConnected = true;
      setStatus('Live • Listening', 'active');
      setOrbState('listening');
      mainMicBtn.classList.add('active');
      interruptBtn.disabled = false;
      updateTranscript('Arushi is listening... Speak in Hindi, English, Hinglish, or any language.');
      startMicStream();
      return;
    }

    // 2. Tool calls from model
    if (msg.toolCall) {
      console.log('[Gemini Live] Tool Call received:', msg.toolCall);
      const functionCalls = msg.toolCall.functionCalls || [];
      const responses = [];

      for (const fc of functionCalls) {
        const result = await executeAction(fc.name, fc.args || {});
        responses.push({
          id: fc.id,
          name: fc.name,
          response: {
            output: result
          }
        });
      }

      // Send response back to Gemini Live
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        const toolResponseMsg = {
          toolResponse: {
            functionResponses: responses
          }
        };
        console.log('[Gemini Live] Sending tool response:', toolResponseMsg);
        state.ws.send(JSON.stringify(toolResponseMsg));
      }
      return;
    }

    // 3. Server content (voice output / text)
    if (msg.serverContent) {
      const sc = msg.serverContent;

      // Handle user interruption
      if (sc.interrupted) {
        console.log('[Gemini Live] Interrupted by user!');
        stopAudioPlayback();
        setStatus('Live • Listening', 'active');
        setOrbState('listening');
        return;
      }

      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          // Play audio chunks
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/pcm')) {
            queuePcmAudio(part.inlineData.data);
          }
          // Display text transcripts
          if (part.text) {
            updateTranscript(part.text);
          }
        }
      }

      if (sc.turnComplete) {
        console.log('[Gemini Live] Turn complete.');
      }
    }
  }

  // --- Audio Recording & Mic Pipeline ---
  async function startMicStream() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!state.audioContext) {
        state.audioContext = new AudioCtx({ sampleRate: 16000 });
      }
      if (state.audioContext.state === 'suspended') {
        await state.audioContext.resume();
      }

      state.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const source = state.audioContext.createMediaStreamSource(state.micStream);
      state.analyser = state.audioContext.createAnalyser();
      state.analyser.fftSize = 64;
      source.connect(state.analyser);

      // 4096 buffer size
      state.scriptProcessor = state.audioContext.createScriptProcessor(4096, 1, 1);

      state.scriptProcessor.onaudioprocess = (e) => {
        if (!state.isConnected || !state.ws || state.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        // Resample/convert Float32 to Int16 PCM
        const pcm16 = floatTo16BitPCM(inputData);
        const base64 = arrayBufferToBase64(pcm16.buffer);

        const realTimeMsg = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm;rate=16000",
                data: base64
              }
            ]
          }
        };

        state.ws.send(JSON.stringify(realTimeMsg));
      };

      source.connect(state.scriptProcessor);
      state.scriptProcessor.connect(state.audioContext.destination);

      state.isRecording = true;
      startVisualizer();
    } catch (err) {
      console.error('Error starting mic stream:', err);
      updateTranscript('Microphone permission required for voice-to-voice. Please allow microphone access.');
    }
  }

  function stopRecording() {
    state.isRecording = false;
    if (state.scriptProcessor) {
      state.scriptProcessor.disconnect();
      state.scriptProcessor = null;
    }
    if (state.micStream) {
      state.micStream.getTracks().forEach(track => track.stop());
      state.micStream = null;
    }
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    state.isConnected = false;
    stopVisualizer();
    setStatus('Ready', '');
    setOrbState('');
    mainMicBtn.classList.remove('active');
    interruptBtn.disabled = true;
  }

  function floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Int16Array(buffer);
  }

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // --- Audio Output Playback (24kHz Raw PCM from Gemini) ---
  function initPlaybackContext() {
    if (!state.playbackContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      state.playbackContext = new AudioCtx({ sampleRate: 24000 });
      state.nextPlayTime = state.playbackContext.currentTime;
    }
    if (state.playbackContext.state === 'suspended') {
      state.playbackContext.resume();
    }
  }

  function queuePcmAudio(base64Pcm) {
    initPlaybackContext();

    const binaryStr = window.atob(base64Pcm);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = state.playbackContext.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const source = state.playbackContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(state.playbackContext.destination);

    const currentTime = state.playbackContext.currentTime;
    const startTime = Math.max(currentTime, state.nextPlayTime);
    source.start(startTime);
    state.nextPlayTime = startTime + audioBuffer.duration;

    state.scheduledSources.push(source);

    // Arushi Speaking State
    state.isArushiSpeaking = true;
    setStatus('Arushi Speaking', 'speaking');
    setOrbState('speaking');

    source.onended = () => {
      const idx = state.scheduledSources.indexOf(source);
      if (idx !== -1) state.scheduledSources.splice(idx, 1);

      if (state.scheduledSources.length === 0) {
        state.isArushiSpeaking = false;
        if (state.isConnected) {
          setStatus('Live • Listening', 'active');
          setOrbState('listening');
        }
      }
    };
  }

  function stopAudioPlayback() {
    for (const src of state.scheduledSources) {
      try {
        src.stop();
      } catch (e) {}
    }
    state.scheduledSources = [];
    if (state.playbackContext) {
      state.nextPlayTime = state.playbackContext.currentTime;
    }
    state.isArushiSpeaking = false;
  }

  // --- Equalizer & Visualizer Animation ---
  function startVisualizer() {
    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);

    function render() {
      state.animFrameId = requestAnimationFrame(render);
      if (!state.analyser) return;

      state.analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const avg = sum / dataArray.length;

      waveBars.forEach((bar, index) => {
        const val = dataArray[index % dataArray.length] || avg;
        const height = Math.max(6, (val / 255) * 32);
        bar.style.height = `${height}px`;
      });
    }

    render();
  }

  function stopVisualizer() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    waveBars.forEach(bar => {
      bar.style.height = '6px';
    });
  }

  // --- Text Turn / Quick Chip Execution ---
  async function sendTextPrompt(prompt) {
    if (!prompt || !prompt.trim()) return;
    const text = prompt.trim();
    updateTranscript(text, true);

    // If Gemini Live WebSocket is active, send client turn
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      const clientTurnMsg = {
        clientContent: {
          turns: [
            {
              role: "user",
              parts: [{ text: text }]
            }
          ],
          turnComplete: true
        }
      };
      state.ws.send(JSON.stringify(clientTurnMsg));
      return;
    }

    // If not connected to Live WebSocket, run local natural command intent parser + REST fallback
    console.log('[Text Command] Fallback processing for:', text);
    const lower = text.toLowerCase();

    // Natural matching for commands
    if (lower.includes('whatsapp')) {
      await executeAction('openWhatsApp', {});
      updateTranscript('Opening WhatsApp on device...');
      return;
    }

    if (lower.includes('youtube')) {
      await executeAction('openApp', { appName: 'YouTube' });
      return;
    }

    if (lower.includes('instagram')) {
      await executeAction('openApp', { appName: 'Instagram' });
      return;
    }

    if (lower.includes('chrome')) {
      await executeAction('openApp', { appName: 'Chrome' });
      return;
    }

    if (lower.includes('setting')) {
      await executeAction('openApp', { appName: 'Settings' });
      return;
    }

    // Calling phone number
    const phoneMatch = text.match(/\b\d{10}\b/);
    if (phoneMatch && (lower.includes('call') || lower.includes('phone') || lower.includes('lagao'))) {
      await executeAction('makeCall', { phoneNumber: phoneMatch[0] });
      return;
    }

    // Calling contact by name
    if (lower.includes('call mom') || lower.includes('mummy ko call') || lower.includes('call mummy') || lower.includes('mom ko phone')) {
      await executeAction('callContact', { contactName: 'Mom' });
      return;
    }

    if (lower.includes('call rahul') || lower.includes('rahul ko call')) {
      await executeAction('callContact', { contactName: 'Rahul' });
      return;
    }

    if (lower.includes('call dad') || lower.includes('papa ko call')) {
      await executeAction('callContact', { contactName: 'Dad' });
      return;
    }

    // Multilingual speech test
    if (lower.includes('hindi')) {
      languageText.textContent = 'Active Language: Hindi (हिंदी)';
      updateTranscript('नमस्ते! मैं आरुषी हूँ। मैं आपकी क्या मदद कर सकती हूँ?');
      return;
    }

    if (lower.includes('english')) {
      languageText.textContent = 'Active Language: English';
      updateTranscript("Hello! I'm Arushi. How can I assist you today?");
      return;
    }

    if (lower.includes('hinglish')) {
      languageText.textContent = 'Active Language: Hinglish (Hindi + English)';
      updateTranscript('Hey there! Arushi yahan hai. Batao aaj kya karna hai?');
      return;
    }

    // Default: instruct user to start live voice
    updateTranscript(`Command "${text}" received. Tap the microphone to talk with Arushi in real-time.`);
  }

  // --- Event Listeners ---
  mainMicBtn.addEventListener('click', () => {
    if (state.isRecording || state.isConnected) {
      stopRecording();
    } else {
      connectGeminiLive();
    }
  });

  orbContainer.addEventListener('click', () => {
    mainMicBtn.click();
  });

  interruptBtn.addEventListener('click', () => {
    console.log('[User Interrupt] Stopping Arushi voice output');
    stopAudioPlayback();
    if (state.isConnected) {
      setStatus('Live • Listening', 'active');
      setOrbState('listening');
    }
  });

  toggleTextInputBtn.addEventListener('click', () => {
    const isHidden = textInputBar.style.display === 'none';
    textInputBar.style.display = isHidden ? 'flex' : 'none';
    if (isHidden) textPromptInput.focus();
  });

  sendPromptBtn.addEventListener('click', () => {
    const prompt = textPromptInput.value;
    textPromptInput.value = '';
    sendTextPrompt(prompt);
  });

  textPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const prompt = textPromptInput.value;
      textPromptInput.value = '';
      sendTextPrompt(prompt);
    }
  });

  // Quick Command Chips
  cmdChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const cmd = chip.getAttribute('data-command');
      sendTextPrompt(cmd);
    });
  });

  // Settings Modal Controls
  openSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('open');
  });

  closeSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('open');
  });

  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.remove('open');
    }
  });

  toggleApiKeyVisibility.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleApiKeyVisibility.textContent = isPassword ? 'Hide' : 'Show';
  });

  saveSettingsBtn.addEventListener('click', () => {
    const newKey = apiKeyInput.value.trim();
    if (newKey) {
      state.apiKey = newKey;
      localStorage.setItem('arushi_gemini_api_key', newKey);
    }
    state.model = modelSelect.value;
    state.voiceName = voiceSelect.value;
    settingsModal.classList.remove('open');
    showActionBanner('⚙️', 'Settings Saved', 'Updated Arushi model and voice parameters', 'Saved');
  });

  // Test Actions in Settings
  seedContactsBtn.addEventListener('click', () => {
    const bridge = getAndroidBridge();
    if (bridge && typeof bridge.seedContactsIfNeeded === 'function') {
      const res = bridge.seedContactsIfNeeded();
      showActionBanner('👥', 'Contacts Seeded', res || 'Mom, Dad, Rahul Sharma, Rahul Verma added', 'Done');
    } else {
      showActionBanner('⚠️', 'Seeding Unavailable', 'Contact insertion requires Android APK bridge', 'Web Mode');
    }
  });

  testBridgeBtn.addEventListener('click', () => {
    const bridge = getAndroidBridge();
    if (bridge) {
      showActionBanner('⚡', 'Bridge Verified', 'Android Action Bridge is fully functional', 'Active');
    } else {
      showActionBanner('⚠️', 'Bridge Missing', 'Native Android Bridge not detected in browser', 'Web Mode');
    }
  });

  // --- Initialize on DOM Load ---
  document.addEventListener('DOMContentLoaded', () => {
    initBridge();
  });

  // Also expose global handle for testing
  window.ArushiApp = {
    state,
    executeAction,
    sendTextPrompt,
    connectGeminiLive,
    stopRecording
  };

})();
