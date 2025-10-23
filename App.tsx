import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Course, Lecture, InputType, PlayerState, Toast as ToastType, AudioState } from './types';
import { VOICES, LANGUAGES } from './constants';
import { generateCourseOutline, generateLectureDetails, generateLectureAudio, startVideoGeneration, getVideoOperationStatus } from './services/geminiService';
import { decodeAudioData, decode, downloadWav, createMergedWavBlob } from './utils/audioUtils';
import { PlayIcon, PauseIcon, DownloadIcon, NotesIcon, QuizIcon, DocumentTextIcon, DocumentArrowUpIcon, VideoCameraIcon, PencilIcon, ArrowPathIcon, FilmIcon, BookOpenIcon, CheckCircleIcon } from './components/icons';
import Modal from './components/Modal';
import AudioPlayer from './components/AudioPlayer';
import EditLectureModal from './components/EditLectureModal';
import Toast from './components/Toast';

type LectureUiState = Record<number, { audioState: AudioState }>;
type ModalContent = { type: 'notes' | 'quiz' | 'edit'; lecture: Lecture; index: number };

type VideoStateStatus = 'idle' | 'generating' | 'ready' | 'error';
interface VideoState {
  status: VideoStateStatus;
  url?: string;
  error?: string;
}

declare const pdfjsLib: any;
declare const jspdf: any;

const formatDisplayDuration = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};

const EnhancedLoadingState = ({ status }: { status: { step: number; message: string; } }) => {
    const steps = [
        "Analyzing Input & Outlining Course",
    ];

    return (
        <div className="bg-slate-800 rounded-xl shadow-lg p-6 md:p-8 animate-fade-in">
            <div className="text-center">
                <h2 className="text-2xl font-bold text-cyan-400 mb-2">Creating Your Course...</h2>
                <p className="text-slate-400">{status.message}</p>
            </div>
            <div className="mt-8 space-y-5">
                {steps.map((label, index) => (
                    <div key={label} className="flex items-start gap-4">
                        <div className="flex flex-col items-center h-full">
                           <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                                <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        </div>
                        <div className="pt-0.5">
                            <p className="font-semibold text-white">{label}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

const CreationStepProgressBar = ({ currentStep }: { currentStep: number }) => {
    const steps = ['Source', 'Content', 'Configure'];
    return (
        <div className="flex items-center justify-center mb-8">
            {steps.map((step, index) => (
                <React.Fragment key={step}>
                    <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                            index + 1 <= currentStep ? 'bg-cyan-500 text-white' : 'bg-slate-700 text-slate-400'
                        }`}>
                            {index + 1}
                        </div>
                        <span className={`ml-2 font-semibold ${index + 1 <= currentStep ? 'text-white' : 'text-slate-400'}`}>
                            {step}
                        </span>
                    </div>
                    {index < steps.length - 1 && (
                        <div className="flex-auto border-t-2 transition-all duration-300 mx-4 border-slate-700"></div>
                    )}
                </React.Fragment>
            ))}
        </div>
    );
};


const App: React.FC = () => {
    const [creationStep, setCreationStep] = useState(1);
    const [inputType, setInputType] = useState<InputType>('topic');
    const [topic, setTopic] = useState<string>('');
    const [textInput, setTextInput] = useState<string>('');
    const [youtubeLink, setYoutubeLink] = useState<string>('');
    const [pdfFileName, setPdfFileName] = useState<string>('');
    const [pdfTextContent, setPdfTextContent] = useState<string>('');
    const [isParsingPdf, setIsParsingPdf] = useState<boolean>(false);
    const [pdfParseProgress, setPdfParseProgress] = useState<number>(0);
    const [videoFileName, setVideoFileName] = useState<string>('');
    const [videoBase64Content, setVideoBase64Content] = useState<string>('');
    const [videoMimeType, setVideoMimeType] = useState<string>('');
    const [isParsingVideo, setIsParsingVideo] = useState<boolean>(false);

    const [language, setLanguage] = useState<string>(LANGUAGES[0].id);
    const [voiceId, setVoiceId] = useState<string>(VOICES[0].id);
    const [isOutlining, setIsOutlining] = useState<boolean>(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState<boolean>(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);
    
    const [toasts, setToasts] = useState<ToastType[]>([]);
    const toastIdCounter = useRef(0);

    const [course, setCourse] = useState<Course | null>(null);
    const [modalContent, setModalContent] = useState<ModalContent | null>(null);
    const [lectureUiState, setLectureUiState] = useState<LectureUiState>({});
    const audioDataCache = useRef<Record<number, string>>({});
    const [currentlyPlaying, setCurrentlyPlaying] = useState<{ lecture: Lecture, index: number } | null>(null);
    const [playerState, setPlayerState] = useState<PlayerState>({ isLoading: false, isPlaying: false, progress: 0, currentTime: 0, duration: 0, volume: 1, error: null });
    const [actualDurations, setActualDurations] = useState<Record<number, number>>({});
    const [videoStates, setVideoStates] = useState<Record<number, VideoState>>({});
    const [videoPlayerUrl, setVideoPlayerUrl] = useState<string | null>(null);
    const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
    const pollingIntervals = useRef<Record<number, number>>({});
    const [lastPlayedIndex, setLastPlayedIndex] = useState<number | null>(null);

    const audioContextRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const audioBufferCache = useRef<Record<number, AudioBuffer>>({});
    const playbackStartTimeRef = useRef<number>(0);
    const playbackPausedTimeRef = useRef<number>(0);
    const animationFrameRef = useRef<number>();
    const intentionallyStoppedRef = useRef<boolean>(false);
    const [loadingStatus, setLoadingStatus] = useState({
        step: 0,
        message: '',
    });

    const addToast = useCallback((message: string, type: ToastType['type'] = 'error') => {
        const id = toastIdCounter.current++;
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);
    
    const ensureAudioContextResumed = async () => {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
    };

    const stopPlayback = useCallback((clearPlayer = false) => {
        intentionallyStoppedRef.current = true;
        cancelAnimationFrame(animationFrameRef.current!);
        if (currentSourceRef.current) {
            currentSourceRef.current.onended = null; // Prevent onended from firing on intentional stop
            currentSourceRef.current.stop();
            currentSourceRef.current.disconnect();
            currentSourceRef.current = null;
        }
        if (clearPlayer) {
            setCurrentlyPlaying(null);
            playbackPausedTimeRef.current = 0;
            setPlayerState(prev => ({ ...prev, isPlaying: false, progress: 0, currentTime: 0, duration: 0, error: null }));
        } else {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
        }
    }, []);

    const startPlayback = useCallback((buffer: AudioBuffer, index: number, offset = 0) => {
        if (!audioContextRef.current || !gainNodeRef.current) return;
        stopPlayback();
        
        intentionallyStoppedRef.current = false;
        const source = audioContextRef.current.createBufferSource();
        source.buffer = buffer;
        source.connect(gainNodeRef.current);
        playbackStartTimeRef.current = audioContextRef.current.currentTime - offset;
        playbackPausedTimeRef.current = offset;
        source.start(0, offset);
        currentSourceRef.current = source;
        setPlayerState(prev => ({ ...prev, isPlaying: true, isLoading: false, duration: buffer.duration }));

        source.onended = () => {
            if (currentSourceRef.current === source && !intentionallyStoppedRef.current) {
                setPlayerState(prev => ({ ...prev, isPlaying: false, progress: 1, currentTime: prev.duration }));
                setLastPlayedIndex(index);
            }
        };
    }, [stopPlayback]);
    
    const playAudioFromCache = useCallback(async (index: number) => {
        try {
            await ensureAudioContextResumed();
            let bufferToPlay = audioBufferCache.current[index];
    
            if (!bufferToPlay) {
                const base64Audio = audioDataCache.current[index];
                if (!base64Audio) {
                    throw new Error("No audio data found in cache.");
                }
                bufferToPlay = await decodeAudioData(decode(base64Audio), audioContextRef.current!, 24000, 1);
                audioBufferCache.current[index] = bufferToPlay;
            }
    
            setActualDurations(prev => ({ ...prev, [index]: bufferToPlay.duration }));
    
            startPlayback(bufferToPlay, index, 0);
        } catch (error) {
            console.error("Failed to decode or play from cache:", error);
            throw new Error("Failed to decode audio data.");
        }
    }, [startPlayback]);

    const generateSingleAudio = useCallback(async (lecture: Lecture, index: number) => {
        setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'loading' } }));
        try {
            const selectedVoice = VOICES.find(v => v.id === voiceId)!;
            const base64Audio = await generateLectureAudio(lecture.script, selectedVoice.ttsValue);
            audioDataCache.current[index] = base64Audio;
            delete audioBufferCache.current[index];
            setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'loaded' } }));
            return base64Audio;
        } catch (err) {
            console.error(`Failed to generate audio for lecture ${index + 1}:`, err);
            setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'error' } }));
            addToast(`Audio generation failed for "${lecture.title}".`);
            return null;
        }
    }, [voiceId, addToast]);

    const handleSetLectureToPlay = useCallback(async (lecture: Lecture, index: number) => {
        await ensureAudioContextResumed();
        if (currentlyPlaying?.index === index) {
            if (playerState.error) return;

            if (playerState.isPlaying) {
                // Pause logic
                if (audioContextRef.current) {
                    playbackPausedTimeRef.current += audioContextRef.current.currentTime - playbackStartTimeRef.current;
                }
                stopPlayback();
            } else {
                // Resume logic
                const buffer = audioBufferCache.current[index];
                if (buffer) {
                    startPlayback(buffer, index, playbackPausedTimeRef.current);
                }
            }
            return;
        }
        
        stopPlayback(true);
        setCurrentlyPlaying({ lecture, index });
        setPlayerState(prev => ({ ...prev, isLoading: true, currentTime: 0, progress: 0, error: null }));

        try {
            let audioData = audioDataCache.current[index];
            const audioState = lectureUiState[index]?.audioState;

            if (!audioData || audioState === 'error') {
                 audioData = await generateSingleAudio(lecture, index);
            }

            if (!audioData) {
                throw new Error('Audio data could not be generated or found.');
            }
            
            await playAudioFromCache(index);

        } catch (err) {
            console.error(`Playback error for lecture ${index + 1}:`, err);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Audio failed to load.' }));
        }
    }, [currentlyPlaying, playerState.isPlaying, playerState.error, stopPlayback, lectureUiState, generateSingleAudio, playAudioFromCache, startPlayback]);
    
    useEffect(() => {
        if (lastPlayedIndex === null || !course) return;

        const nextIndex = lastPlayedIndex + 1;
        if (nextIndex < course.lectures.length) {
            handleSetLectureToPlay(course.lectures[nextIndex], nextIndex);
        } else {
            stopPlayback(true);
        }
        setLastPlayedIndex(null);
    }, [lastPlayedIndex, course, handleSetLectureToPlay, stopPlayback]);

    const updateProgress = useCallback(() => {
        if (!playerState.isPlaying || !currentSourceRef.current || !audioContextRef.current) return;
        
        const elapsedTime = audioContextRef.current.currentTime - playbackStartTimeRef.current;
        const newCurrentTime = playbackPausedTimeRef.current + elapsedTime;
        
        if (newCurrentTime >= playerState.duration) {
             setPlayerState(prev => ({ ...prev, currentTime: prev.duration, progress: 1 }));
        } else {
             setPlayerState(prev => ({ ...prev, currentTime: newCurrentTime, progress: newCurrentTime / prev.duration }));
        }
        animationFrameRef.current = requestAnimationFrame(updateProgress);
    }, [playerState.isPlaying, playerState.duration]);

    useEffect(() => {
        if (playerState.isPlaying) {
            animationFrameRef.current = requestAnimationFrame(updateProgress);
        } else {
            cancelAnimationFrame(animationFrameRef.current!);
        }
        return () => cancelAnimationFrame(animationFrameRef.current!);
    }, [playerState.isPlaying, updateProgress]);
    
     const handleRetryAudioGeneration = useCallback(async () => {
        if (!currentlyPlaying) return;
        const { lecture, index } = currentlyPlaying;
        setPlayerState(prev => ({ ...prev, isLoading: true, error: null }));
        
        await ensureAudioContextResumed();

        try {
            const audioData = await generateSingleAudio(lecture, index);
            if (!audioData) throw new Error("Audio regeneration returned no data.");
            await playAudioFromCache(index);
        } catch (err) {
            console.error("Retry failed:", err);
            setPlayerState(prev => ({ ...prev, isLoading: false, error: 'Audio failed to load.' }));
        }
    }, [currentlyPlaying, generateSingleAudio, playAudioFromCache]);
    
    const isStep2Valid = () => {
         switch (inputType) {
            case 'topic': return topic.trim().length > 0;
            case 'text': return textInput.trim().length > 0;
            case 'pdf': return pdfTextContent.trim().length > 0;
            case 'youtube': try { new URL(youtubeLink.trim()); return true; } catch (_) { return false; }
            case 'video': return videoBase64Content.length > 0;
            default: return false;
        }
    };

    const handleGenerateCourse = async () => {
        let inputValue = '';
        let mimeType: string | undefined = undefined;

        switch (inputType) {
            case 'topic': inputValue = topic.trim(); break;
            case 'text': inputValue = textInput.trim(); break;
            case 'pdf': inputValue = pdfTextContent.trim(); break;
            case 'youtube': inputValue = youtubeLink.trim(); break;
            case 'video': inputValue = videoBase64Content; mimeType = videoMimeType; break;
        }

        stopPlayback(true);
        Object.values(pollingIntervals.current).forEach(clearInterval);
        pollingIntervals.current = {};
        audioDataCache.current = {};
        audioBufferCache.current = {};
        setLectureUiState({});
        setActualDurations({});
        setVideoStates({});
        setIsOutlining(true);
        setCourse(null);
        
        try {
            const inputTypeDisplay = { topic: `topic "${topic.trim()}"`, text: 'provided text', pdf: `PDF "${pdfFileName}"`, youtube: 'YouTube video', video: `video "${videoFileName}"`};
            setLoadingStatus({ step: 1, message: `Analyzing your ${inputTypeDisplay[inputType]}...`});
            
            const courseOutline = await generateCourseOutline(inputType, inputValue, language, mimeType);
            
            setCourse(courseOutline);
            const initialUiState: LectureUiState = {};
            courseOutline.lectures.forEach((_, index) => {
                initialUiState[index] = { audioState: 'content-loading' };
            });
            setLectureUiState(initialUiState);

        } catch (err) {
            addToast(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsOutlining(false);
        }
    };
    
    useEffect(() => {
        if (course && course.lectures.length > 0 && !course.lectures[0].script) {
            const populateAllLectures = async () => {
                await Promise.all(course.lectures.map(async (lecture, index) => {
                    try {
                        const details = await generateLectureDetails(course.courseTitle, lecture.title, lecture.goals, language);

                        setCourse(currentCourse => {
                            if (!currentCourse) return null;
                            const newLectures = [...currentCourse.lectures];
                            newLectures[index] = { ...newLectures[index], ...details };
                            return { ...currentCourse, lectures: newLectures };
                        });
                        setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'loading' } }));
                        
                        const selectedVoice = VOICES.find(v => v.id === voiceId)!;
                        const base64Audio = await generateLectureAudio(details.script, selectedVoice.ttsValue);
                        audioDataCache.current[index] = base64Audio;
                        
                        setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'loaded' } }));

                    } catch (err) {
                        console.error(`Error processing lecture ${index + 1}:`, err);
                        setLectureUiState(prev => ({ ...prev, [index]: { audioState: 'error' } }));
                        addToast(`Failed to generate content for "${lecture.title}"`);
                    }
                }));
                addToast("Your course is fully generated and ready!", 'success');
            };
            populateAllLectures();
        }
    }, [course, language, voiceId, addToast]);
    
    useEffect(() => {
        const initializeAudio = () => {
            if (!audioContextRef.current) {
                const context = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
                audioContextRef.current = context;
                gainNodeRef.current = context.createGain();
                gainNodeRef.current.connect(context.destination);
            }
        };
        document.body.addEventListener('click', initializeAudio, { once: true });
        
        return () => {
             document.body.removeEventListener('click', initializeAudio);
             Object.values(pollingIntervals.current).forEach(clearInterval);
        };
    }, []);

    const pollForVideo = useCallback((operation: any, index: number) => {
        if (pollingIntervals.current[index]) {
            clearInterval(pollingIntervals.current[index]);
        }
        pollingIntervals.current[index] = window.setInterval(async () => {
            try {
                const newOperation = await getVideoOperationStatus(operation);
                if (newOperation.done) {
                    clearInterval(pollingIntervals.current[index]);
                    delete pollingIntervals.current[index];
                    if (newOperation.response) {
                        const downloadLink = newOperation.response?.generatedVideos?.[0]?.video?.uri;
                        if (downloadLink && process.env.API_KEY) {
                            const fullUrl = `${downloadLink}&key=${process.env.API_KEY}`;
                            setVideoStates(prev => ({ ...prev, [index]: { status: 'ready', url: fullUrl } }));
                        } else {
                            throw new Error("Video generated, but no URI found.");
                        }
                    } else {
                        throw new Error(newOperation.error?.message || 'Video generation finished with an error.');
                    }
                }
            } catch (error) {
                clearInterval(pollingIntervals.current[index]);
                delete pollingIntervals.current[index];
                console.error(`Polling failed for lecture ${index}:`, error);
                const errorMessage = error instanceof Error ? error.message : "Polling failed.";
                if (errorMessage.includes('API key is invalid')) {
                     handleGenerateVideo(course!.lectures[index], index, true); // Force re-selection
                }
                setVideoStates(prev => ({ ...prev, [index]: { status: 'error', error: errorMessage } }));
            }
        }, 10000);
    }, [course]);

    const handleGenerateVideo = useCallback(async (lecture: Lecture, index: number, forceKeySelection = false) => {
        const generationLogic = async () => {
            setVideoStates(prev => ({ ...prev, [index]: { status: 'generating' } }));
            try {
                const operation = await startVideoGeneration(lecture.script);
                pollForVideo(operation, index);
            } catch (e) {
                console.error("Video generation failed to start:", e);
                const errorMessage = e instanceof Error ? e.message : 'Failed to start video generation.';
                 if (errorMessage.includes('API key is invalid')) {
                     setPendingAction(() => () => handleGenerateVideo(lecture, index, true)); // Persist the action
                     setIsApiKeyModalOpen(true);
                 } else {
                    setVideoStates(prev => ({ ...prev, [index]: { status: 'error', error: errorMessage } }));
                 }
            }
        };
        
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey || forceKeySelection) {
            setPendingAction(() => generationLogic);
            setIsApiKeyModalOpen(true);
        } else {
            generationLogic();
        }
    }, [pollForVideo]);

    const handleSelectApiKey = async () => {
        try {
            await window.aistudio.openSelectKey();
            setIsApiKeyModalOpen(false);
            if (pendingAction) {
                pendingAction();
                setPendingAction(null);
            }
        } catch (e) {
            console.error('Error selecting API key:', e);
            setPendingAction(null);
            setIsApiKeyModalOpen(false);
        }
    };
    
    const handleSeek = async (newProgress: number) => {
        const index = currentlyPlaying?.index;
        if (index === undefined || !playerState.duration) return;
        const newTime = playerState.duration * newProgress;
        
        playbackPausedTimeRef.current = newTime;
        setPlayerState(prev => ({ ...prev, progress: newProgress, currentTime: newTime }));
        
        const buffer = audioBufferCache.current[index];
        if (playerState.isPlaying && buffer){
            await ensureAudioContextResumed();
            startPlayback(buffer, index, newTime);
        }
    };
    
    const handleVolumeChange = (newVolume: number) => {
        if (gainNodeRef.current) gainNodeRef.current.gain.value = newVolume;
        setPlayerState(prev => ({...prev, volume: newVolume}));
    };
    
    const handleUpdateLecture = (index: number, updatedLecture: Lecture) => {
        if (!course) return;
        const updatedLectures = [...course.lectures];
        const oldScript = updatedLectures[index].script;
        updatedLectures[index] = updatedLecture;
        setCourse({ ...course, lectures: updatedLectures });
        setModalContent(null);
        
        if (oldScript !== updatedLecture.script) {
            delete audioDataCache.current[index];
            delete audioBufferCache.current[index];
            setActualDurations(prev => { const s = {...prev}; delete s[index]; return s; });
            setVideoStates(prev => { const s = {...prev}; delete s[index]; return s; });
            generateSingleAudio(updatedLecture, index);
        }
    };

    const handleDownload = async (lecture: Lecture, index: number) => {
        try {
            const audioState = lectureUiState[index]?.audioState;
            let audioData = audioDataCache.current[index];
            if (!audioData || audioState === 'error') {
                 audioData = await generateSingleAudio(lecture, index) ?? '';
            }
            if (audioData) {
                downloadWav(audioData, `${lecture.title.replace(/\s/g, '_')}`);
            }
        } catch (err) {
            addToast(`Could not download audio for ${lecture.title}.`);
        }
    };

    const handleDownloadAll = async () => {
        if (!course) return;
        setIsDownloadingAll(true);
        addToast('Preparing your full course audio...', 'info');

        try {
            const audioDatas: string[] = [];
            
            for (let i = 0; i < course.lectures.length; i++) {
                const lecture = course.lectures[i];
                let audioData = audioDataCache.current[i];
                if (!audioData || lectureUiState[i]?.audioState === 'error' || lectureUiState[i]?.audioState !== 'loaded') {
                    addToast(`Waiting for audio for "${lecture.title}"...`, 'info');
                    // Simple poll to wait for audio data
                    await new Promise<void>((resolve, reject) => {
                        let attempts = 0;
                        const interval = setInterval(() => {
                            if (audioDataCache.current[i]) {
                                clearInterval(interval);
                                resolve();
                            } else if (attempts > 60) { // Timeout after 1 min
                                clearInterval(interval);
                                reject(new Error(`Timed out waiting for audio: ${lecture.title}`));
                            }
                            attempts++;
                        }, 1000);
                    });
                    audioData = audioDataCache.current[i];
                }
                if (audioData) {
                    audioDatas.push(audioData);
                } else {
                    throw new Error(`Audio generation failed for "${lecture.title}"`);
                }
            }

            if (audioDatas.length !== course.lectures.length) {
                throw new Error("Could not generate all lecture audios.");
            }

            addToast('Merging audio files...', 'info');
            const mergedBlob = createMergedWavBlob(audioDatas);
            
            const courseFilename = `${course.courseTitle.replace(/[\\/:"*?<>|]/g, '').replace(/\s/g, '_')}_Full_Course.wav`;
            
            const url = URL.createObjectURL(mergedBlob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = courseFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (err) {
            addToast(err instanceof Error ? err.message : 'An error occurred while creating the course audio file.');
        } finally {
            setIsDownloadingAll(false);
        }
    };

    const handleDownloadCourseBook = async () => {
        if (!course || !course.lectures[0].script) {
            addToast('Please wait for all lecture content to be generated before downloading the book.', 'info');
            return;
        };
        setIsGeneratingPdf(true);
        addToast('Generating your course book...', 'info');
    
        try {
            const { jsPDF } = jspdf;
            const doc = new jsPDF({
                orientation: 'p',
                unit: 'mm',
                format: 'a4'
            });
            const pageHeight = doc.internal.pageSize.height;
            const pageWidth = doc.internal.pageSize.width;
            const margin = 15;
            const maxLineWidth = pageWidth - margin * 2;
            let y = margin;
    
            const checkAndAddPage = (spaceNeeded: number) => {
                if (y + spaceNeeded > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
            };
    
            const addWrappedText = (text: string, size: number, style: 'normal' | 'bold' | 'italic', spaceAfter: number) => {
                doc.setFontSize(size);
                doc.setFont('helvetica', style);
                const lines = doc.splitTextToSize(text, maxLineWidth);
                const textBlockHeight = lines.length * (size * 0.35); // A reasonable line height factor
                checkAndAddPage(textBlockHeight);
                doc.text(lines, margin, y);
                y += textBlockHeight + spaceAfter;
            };
    
            // --- Cover Page ---
            addWrappedText(course.courseTitle, 22, 'bold', 10);
            addWrappedText(`Total Duration: ${course.totalDuration}`, 12, 'normal', 5);
            addWrappedText('An AI-Generated Course Book', 12, 'italic', 0);
    
            // --- Lectures ---
            course.lectures.forEach((lecture, index) => {
                doc.addPage();
                y = margin;
    
                addWrappedText(`Lecture ${index + 1}: ${lecture.title}`, 16, 'bold', 10);
                
                addWrappedText('Learning Goals', 14, 'bold', 4);
                addWrappedText(lecture.goals.replace(/\n/g, '\n\n'), 11, 'normal', 10);
                
                addWrappedText('Summary', 14, 'bold', 4);
                addWrappedText(lecture.summary, 11, 'normal', 10);
                
                addWrappedText('Full Script', 14, 'bold', 4);
                addWrappedText(lecture.script, 11, 'normal', 10);
    
                addWrappedText('Quiz', 14, 'bold', 4);
                const quizText = lecture.quiz.map((q, i) => `${i + 1}. ${q}`).join('\n');
                addWrappedText(quizText, 11, 'normal', 0);
            });
    
            const courseFilename = `${course.courseTitle.replace(/[\\/:"*?<>|]/g, '').replace(/\s/g, '_')}_Course_Book.pdf`;
            doc.save(courseFilename);
            
        } catch (err) {
            console.error("PDF generation failed:", err);
            addToast('Failed to generate the course book PDF.', 'error');
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setPdfFileName('');
            setPdfTextContent('');
            setPdfParseProgress(0);
            return;
        }

        setPdfFileName(file.name);
        setPdfTextContent('');
        setIsParsingPdf(true);
        setPdfParseProgress(0);

        try {
            if (typeof pdfjsLib === 'undefined') {
                throw new Error("pdf.js library is not loaded.");
            }
            const fileReader = new FileReader();
            fileReader.onload = async (event) => {
                if (!event.target?.result) {
                    addToast('Failed to read PDF file content.');
                    setIsParsingPdf(false);
                    setPdfFileName('');
                    return;
                }
                try {
                    const typedarray = new Uint8Array(event.target.result as ArrayBuffer);
                    const pdf = await pdfjsLib.getDocument(typedarray).promise;
                    let fullText = '';
                    const numPages = pdf.numPages;
                    for (let i = 1; i <= numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map((item: { str: string }) => item.str).join(' ');
                        fullText += pageText + '\n\n';
                        setPdfParseProgress(Math.round((i / numPages) * 100));
                    }
                    setPdfTextContent(fullText.trim());
                } catch (pdfError: any) {
                     console.error("Error parsing PDF content:", pdfError);
                     let errorMessage = 'Failed to parse PDF. The file might be corrupted or in an unsupported format.';
                     if (pdfError.name === 'PasswordException') {
                         errorMessage = 'This PDF is password-protected and cannot be processed.';
                     }
                     addToast(errorMessage);
                     setPdfFileName('');
                } finally {
                    setIsParsingPdf(false);
                }
            };
            fileReader.onerror = () => {
                 addToast('Error reading the PDF file.');
                 setIsParsingPdf(false);
                 setPdfFileName('');
            };
            fileReader.readAsArrayBuffer(file);
        } catch (err) {
            console.error("PDF processing setup error:", err);
            addToast(err instanceof Error ? err.message : 'An unexpected error occurred during PDF setup.');
            setIsParsingPdf(false);
            setPdfFileName('');
        }
    };
    
    const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) {
            setVideoFileName('');
            setVideoBase64Content('');
            setVideoMimeType('');
            return;
        }

        setVideoFileName(file.name);
        setVideoBase64Content('');
        setVideoMimeType('');
        setIsParsingVideo(true);

        try {
            const base64 = await blobToBase64(file);
            setVideoBase64Content(base64);
            setVideoMimeType(file.type);
        } catch (error) {
            addToast('Failed to read video file.');
            console.error("Error converting video to base64:", error);
        } finally {
            setIsParsingVideo(false);
        }
    };

    const inputOptions: { id: InputType; label: string; icon: React.ReactElement }[] = [
        { id: 'topic', label: 'Topic', icon: <QuizIcon className="w-8 h-8" /> },
        { id: 'text', label: 'Text', icon: <DocumentTextIcon className="w-8 h-8" /> },
        { id: 'pdf', label: 'PDF', icon: <DocumentArrowUpIcon className="w-8 h-8" /> },
        { id: 'youtube', label: 'YouTube', icon: <VideoCameraIcon className="w-8 h-8" /> },
        { id: 'video', label: 'Video', icon: <FilmIcon className="w-8 h-8" /> },
    ];


    return (
        <div className="min-h-screen font-sans">
            <header className="py-4 px-6 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-30 border-b border-slate-800">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-cyan-400">AI Lecture Generator</h1>
                </div>
            </header>

            <main className="max-w-4xl mx-auto p-4 sm:p-6 md:p-8">
                <section className="text-center mb-12 animate-fade-in-slide-up">
                    <h2 className="text-4xl md:text-5xl font-extrabold mb-3 bg-gradient-to-r from-cyan-400 to-blue-500 text-transparent bg-clip-text">
                        Create Audio Lectures Instantly
                    </h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto">
                        Turn any topic, text, PDF, YouTube video, or video file into a mobile-friendly audio course in seconds.
                    </p>
                </section>
                
                <section className="bg-slate-800 rounded-xl p-6 md:p-8 shadow-2xl mb-8 animate-fade-in-slide-up" style={{ animationDelay: '0.2s' }}>
                    <CreationStepProgressBar currentStep={creationStep} />
                    
                    {/* Step 1: Choose Source */}
                    {creationStep === 1 && (
                        <div className="animate-fade-in">
                            <h3 className="text-2xl font-bold text-center mb-6 text-cyan-300">Choose your source material</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                                {inputOptions.map(({ id, label, icon }) => (
                                    <button
                                        key={id}
                                        onClick={() => { setInputType(id); setCreationStep(2); }}
                                        className={`group flex flex-col items-center justify-center p-6 rounded-lg text-center transition-all duration-300 transform hover:-translate-y-1
                                            ${inputType === id ? 'bg-cyan-500/10 border-2 border-cyan-500 shadow-lg' : 'bg-slate-700/50 border-2 border-transparent hover:bg-slate-700'}`}
                                    >
                                        <div className={`transition-colors duration-300 ${inputType === id ? 'text-cyan-400' : 'text-slate-400 group-hover:text-cyan-400'}`}>{icon}</div>
                                        <span className="mt-2 font-semibold text-sm">{label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Provide Content */}
                    {creationStep === 2 && (
                         <div className="animate-fade-in">
                            <h3 className="text-2xl font-bold text-center mb-6 text-cyan-300">Provide Content</h3>
                            <div className="bg-slate-700/30 p-6 rounded-lg">
                                {inputType === 'topic' && <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g., 'The History of Ancient Rome'" className="w-full p-3 bg-slate-700 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none" />}
                                {inputType === 'text' && <textarea value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="Paste your text here..." rows={6} className="w-full p-3 bg-slate-700 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none"></textarea>}
                                {inputType === 'youtube' && <input type="text" value={youtubeLink} onChange={(e) => setYoutubeLink(e.target.value)} placeholder="Enter a YouTube video URL" className="w-full p-3 bg-slate-700 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none" />}
                                {inputType === 'pdf' && (
                                    <>
                                        <div className="flex items-center justify-center w-full">
                                            <label htmlFor="pdf-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-700 hover:bg-slate-600 transition-colors">
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    <DocumentArrowUpIcon className="w-8 h-8 mb-2 text-slate-400" />
                                                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                                                    <p className="text-xs text-slate-500">PDF file</p>
                                                </div>
                                                <input id="pdf-upload" type="file" className="hidden" accept=".pdf" onChange={handleFileChange} />
                                            </label>
                                        </div>
                                        {pdfFileName && (
                                            <div className="mt-3 text-sm text-slate-400">
                                                <p className="truncate">File: {pdfFileName}</p>
                                                {isParsingPdf && (
                                                    <div className="mt-2">
                                                        <div className="flex justify-between items-center mb-1">
                                                            <span>Parsing pages...</span>
                                                            <span className="font-semibold">{pdfParseProgress}%</span>
                                                        </div>
                                                        <div className="w-full bg-slate-600 rounded-full h-2">
                                                            <div 
                                                                className="bg-cyan-500 h-2 rounded-full transition-all duration-300 ease-in-out" 
                                                                style={{ width: `${pdfParseProgress}%` }}>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                                 {inputType === 'video' && (
                                    <>
                                        <div className="flex items-center justify-center w-full">
                                            <label htmlFor="video-upload" className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-600 border-dashed rounded-lg cursor-pointer bg-slate-700 hover:bg-slate-600 transition-colors">
                                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                                    <FilmIcon className="w-8 h-8 mb-2 text-slate-400" />
                                                    <p className="mb-2 text-sm text-slate-400"><span className="font-semibold">Click to upload a video</span></p>
                                                    <p className="text-xs text-slate-500">MP4, WebM, etc.</p>
                                                </div>
                                                <input id="video-upload" type="file" className="hidden" accept="video/*" onChange={handleVideoFileChange} />
                                            </label>
                                        </div>
                                        {videoFileName && <p className="text-sm mt-3 text-slate-400">File: {videoFileName} {isParsingVideo && '(Processing...)'}</p>}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {/* Step 3: Configure Course */}
                    {creationStep === 3 && (
                         <div className="animate-fade-in">
                             <h3 className="text-2xl font-bold text-center mb-6 text-cyan-300">Configure Course</h3>
                             <div className="bg-slate-700/30 p-6 rounded-lg">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label htmlFor="language" className="block text-sm font-medium mb-2">Language</label>
                                        <select id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full p-3 bg-slate-700 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none">
                                            {LANGUAGES.map(lang => <option key={lang.id} value={lang.id}>{lang.name}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label htmlFor="voice" className="block text-sm font-medium mb-2">Narrator's Voice</label>
                                        <select id="voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} className="w-full p-3 bg-slate-700 rounded-md border border-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none">
                                            {VOICES.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                             </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <div className="flex justify-between items-center mt-8">
                        {creationStep > 1 ? (
                             <button onClick={() => setCreationStep(creationStep - 1)} className="bg-slate-600 text-white font-semibold py-2 px-6 rounded-full hover:bg-slate-500 transition-colors">Back</button>
                        ) : <div></div>}

                        {creationStep < 3 && (
                            <button onClick={() => setCreationStep(creationStep + 1)} disabled={creationStep === 2 && !isStep2Valid()} className="bg-cyan-500 text-white font-bold py-2 px-6 rounded-full hover:bg-cyan-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Next</button>
                        )}

                         {creationStep === 3 && (
                            <button
                                onClick={handleGenerateCourse}
                                disabled={isOutlining}
                                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold py-3 px-8 rounded-full shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-wait disabled:scale-100 disabled:shadow-none"
                            >
                                {isOutlining ? (
                                    <div className="flex items-center justify-center gap-2">
                                        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"></div>
                                        <span>Generating Outline...</span>
                                    </div>
                                ) : "✨ Generate My Course"}
                            </button>
                         )}
                    </div>
                </section>

                {isOutlining && <EnhancedLoadingState status={loadingStatus} />}

                {course && (
                    <section className="bg-slate-800 rounded-xl shadow-lg p-6 animate-fade-in">
                        <div className="border-b border-slate-700 pb-4 mb-6">
                            <h2 className="text-3xl font-bold text-cyan-400">{course.courseTitle}</h2>
                            <p className="text-slate-400">Total Duration: {course.totalDuration}</p>
                            <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button onClick={handleDownloadAll} disabled={isDownloadingAll} className="bg-slate-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-slate-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait">
                                    {isDownloadingAll ? (
                                         <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <DownloadIcon className="w-5 h-5" />
                                    )}
                                    {isDownloadingAll ? 'Processing Audio...' : 'Download Full Course Audio'}
                                </button>
                                <button onClick={handleDownloadCourseBook} disabled={isGeneratingPdf} className="bg-slate-600 text-white font-semibold py-2 px-4 rounded-md hover:bg-slate-500 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait">
                                    {isGeneratingPdf ? (
                                        <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <BookOpenIcon className="w-5 h-5" />
                                    )}
                                    {isGeneratingPdf ? 'Generating PDF...' : 'Download Course Book'}
                                </button>
                            </div>
                        </div>

                        <ul className="space-y-3 stagger-children">
                            {course.lectures.map((lecture, index) => {
                                const state = lectureUiState[index]?.audioState;
                                const hasContent = !!lecture.script;
                                const videoState = videoStates[index] || { status: 'idle' };
                                const isPlayingThis = currentlyPlaying?.index === index && playerState.isPlaying;
                                const isSelected = currentlyPlaying?.index === index;
                                const progress = isSelected ? playerState.progress : 0;
                                return (
                                    <li key={index} className={`bg-slate-700/50 rounded-lg shadow-md transition-all duration-300 progress-bar-bg hover:bg-slate-700 ${isSelected ? 'ring-2 ring-cyan-500' : ''}`} style={{animationDelay: `${index * 100}ms`}}>
                                        <div className="progress-bar-fg" style={{ width: `${progress * 100}%` }}></div>
                                        <div className="progress-bar-content">
                                            <div className="p-4 flex items-center gap-4">
                                                <button
                                                    onClick={() => state === 'error' ? {} : handleSetLectureToPlay(lecture, index)}
                                                    disabled={!hasContent || state === 'content-loading' || state === 'loading'}
                                                    className={`w-12 h-12 flex-shrink-0 flex items-center justify-center rounded-full transform transition-all duration-200 active:scale-95 ${
                                                        state === 'error' 
                                                        ? 'bg-red-500 text-white' 
                                                        : isPlayingThis 
                                                        ? 'bg-cyan-600 text-white' 
                                                        : 'bg-slate-600 text-slate-200 hover:bg-slate-500'
                                                    } disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed`}
                                                    aria-label={
                                                        !hasContent ? `Generating content for ${lecture.title}` :
                                                        state === 'error' ? `Error generating audio for ${lecture.title}` : 
                                                        isPlayingThis ? `Pause ${lecture.title}` : `Play ${lecture.title}`
                                                    }
                                                >
                                                    {(state === 'content-loading' || (state === 'loading' && (!isSelected || playerState.isLoading))) ? (
                                                        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"></div>
                                                    ) : state === 'error' ? (
                                                        <ArrowPathIcon className="w-6 h-6" /> // TODO: Add retry logic for content/audio
                                                    ) : (
                                                        isPlayingThis ? <PauseIcon /> : <PlayIcon />
                                                    )}
                                                </button>
                                                <div className="flex-grow">
                                                    <h3 className="font-semibold text-lg">{index + 1}. {lecture.title}</h3>
                                                    <p className="text-sm text-slate-400">
                                                        { hasContent ? `Est. Duration: ${lecture.duration}` : 'Goals: ' + lecture.goals }
                                                        {actualDurations[index] && ` | Actual: ${formatDisplayDuration(actualDurations[index])}`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={() => setModalContent({ type: 'notes', lecture, index })} disabled={!hasContent} className="p-2 rounded-full hover:bg-slate-600 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="View Summary & Goals"><NotesIcon /></button>
                                                    <button onClick={() => setModalContent({ type: 'quiz', lecture, index })} disabled={!hasContent} className="p-2 rounded-full hover:bg-slate-600 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Take Quiz"><QuizIcon /></button>
                                                    <button onClick={() => handleDownload(lecture, index)} disabled={state !== 'loaded'} className="p-2 rounded-full hover:bg-slate-600 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Download Audio"><DownloadIcon /></button>
                                                    <button onClick={() => setModalContent({ type: 'edit', lecture, index })} disabled={!hasContent} className="p-2 rounded-full hover:bg-slate-600 transition-colors disabled:text-slate-600 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="Edit Lecture"><PencilIcon /></button>
                                                </div>
                                            </div>
                                            {hasContent && (
                                              <div className="border-t border-slate-600/50 px-4 py-2 flex items-center justify-end gap-2">
                                                  {videoState.status === 'idle' && <button onClick={() => handleGenerateVideo(lecture, index)} className="text-xs font-semibold flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"><VideoCameraIcon className="w-4 h-4"/> Generate Video</button>}
                                                  {videoState.status === 'generating' && <p className="text-xs font-semibold flex items-center gap-1 text-cyan-400"><span className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"></span> Generating Video...</p>}
                                                  {videoState.status === 'ready' && <button onClick={() => setVideoPlayerUrl(videoState.url!)} className="text-xs font-semibold flex items-center gap-1 text-green-400 hover:text-green-300 transition-colors"><FilmIcon className="w-4 h-4"/> Watch Video</button>}
                                                  {videoState.status === 'error' && (
                                                      <div className="flex items-center gap-2">
                                                          <p className="text-xs text-red-400" title={videoState.error}>Video Failed</p>
                                                          <button onClick={() => handleGenerateVideo(lecture, index, true)} className="text-xs font-semibold flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors"><ArrowPathIcon className="w-4 h-4"/> Retry</button>
                                                      </div>
                                                  )}
                                              </div>
                                            )}
                                        </div>
                                    </li>
                                )
                            })}
                        </ul>
                    </section>
                )}
            </main>

            {currentlyPlaying && <AudioPlayer lectureTitle={`${currentlyPlaying.index + 1}. ${currentlyPlaying.lecture.title}`} playerState={playerState} onPlayPause={() => handleSetLectureToPlay(currentlyPlaying.lecture, currentlyPlaying.index)} onClose={() => stopPlayback(true)} onSeek={handleSeek} onVolumeChange={handleVolumeChange} onRetry={handleRetryAudioGeneration} />}
            
            <Modal isOpen={modalContent?.type === 'notes'} onClose={() => setModalContent(null)} title={modalContent?.lecture?.title || ''}>
                {modalContent?.lecture && (
                    <div className="space-y-4">
                        <div>
                            <h3 className="font-semibold text-lg text-cyan-400 mb-2">Learning Goals</h3>
                            <p className="text-slate-300 whitespace-pre-wrap">{modalContent.lecture.goals}</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg text-cyan-400 mb-2">Summary</h3>
                            <p className="text-slate-300 whitespace-pre-wrap">{modalContent.lecture.summary}</p>
                        </div>
                    </div>
                )}
            </Modal>

            <Modal isOpen={modalContent?.type === 'quiz'} onClose={() => setModalContent(null)} title={`Quiz: ${modalContent?.lecture?.title || ''}`}>
                {modalContent?.lecture && (
                    <ul className="space-y-3 list-decimal list-inside text-slate-300">
                        {modalContent.lecture.quiz.map((q, i) => <li key={i}>{q}</li>)}
                    </ul>
                )}
            </Modal>
            
            <EditLectureModal
                isOpen={modalContent?.type === 'edit'}
                onClose={() => setModalContent(null)}
                lecture={modalContent?.type === 'edit' ? modalContent.lecture : null}
                onSave={(updatedLecture) => modalContent?.type === 'edit' && handleUpdateLecture(modalContent.index, updatedLecture)}
                addToast={addToast}
            />
            
            {videoPlayerUrl && (
                 <Modal isOpen={!!videoPlayerUrl} onClose={() => setVideoPlayerUrl(null)} title="Lecture Video">
                     <video src={videoPlayerUrl} controls autoPlay className="w-full rounded-md"></video>
                 </Modal>
            )}

             <Modal
                isOpen={isApiKeyModalOpen}
                onClose={() => { setIsApiKeyModalOpen(false); setPendingAction(null); }}
                title="Select API Key for Video Generation"
                footer={
                    <div className="flex justify-end">
                        <button onClick={handleSelectApiKey} className="bg-cyan-500 text-white font-bold py-2 px-6 rounded-md hover:bg-cyan-600 transition-colors">
                            Select Key
                        </button>
                    </div>
                }
            >
                <p className="text-slate-300">
                    Video generation with Veo requires a project with billing enabled. Please select an API key associated with such a project to proceed.
                    <br/><br/>
                    <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Learn more about billing requirements.</a>
                </p>
            </Modal>
            
            {/* Toast Notification Container */}
            <div className="fixed bottom-4 right-4 z-50 w-full max-w-sm space-y-3">
                {toasts.map(toast => (
                    <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
                ))}
            </div>
        </div>
    );
}

export default App;