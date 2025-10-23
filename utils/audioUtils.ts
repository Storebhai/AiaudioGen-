
// This function decodes a base64 string into a Uint8Array.
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// This function converts raw PCM audio data (as a Uint8Array) into an AudioBuffer that can be played by the Web Audio API.
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// Helper to write a string to a DataView
function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// Core function to build a WAV file Blob from raw PCM data
function pcmToWavBlob(pcmData: Uint8Array): Blob {
    const sampleRate = 24000;
    const numChannels = 1;
    const bitsPerSample = 16;
    
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
  
    // RIFF header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true); // chunkSize
    writeString(view, 8, 'WAVE');
    
    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // subchunk1Size
    view.setUint16(20, 1, true); // audioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // byteRate
    view.setUint16(32, numChannels * (bitsPerSample / 8), true); // blockAlign
    view.setUint16(34, bitsPerSample, true);
    
    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);
  
    // Write PCM data
    new Uint8Array(buffer, 44).set(pcmData);
    
    return new Blob([view], { type: 'audio/wav' });
}


// Creates a proper WAV file Blob from a single base64 encoded raw PCM data string.
export function createWavBlob(base64: string): Blob {
  const pcmData = decode(base64);
  return pcmToWavBlob(pcmData);
}

// Merges multiple base64 encoded raw PCM data strings into a single WAV Blob.
export function createMergedWavBlob(base64Audios: string[]): Blob {
  // Decode all base64 strings into Uint8Arrays
  const pcmChunks = base64Audios.map(b64 => decode(b64));

  // Calculate the total length of the merged PCM data
  const totalLength = pcmChunks.reduce((acc, chunk) => acc + chunk.length, 0);

  // Create a new Uint8Array to hold all the chunks
  const mergedPcm = new Uint8Array(totalLength);

  // Copy each chunk into the merged array
  let offset = 0;
  for (const chunk of pcmChunks) {
    mergedPcm.set(chunk, offset);
    offset += chunk.length;
  }

  // Convert the final merged PCM data to a WAV Blob
  return pcmToWavBlob(mergedPcm);
}

// This function takes a base64 audio string and a filename, and triggers a download for the user.
export function downloadWav(base64: string, filename: string): void {
    const blob = createWavBlob(base64);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = filename.endsWith('.wav') ? filename : `${filename}.wav`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}