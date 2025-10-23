import React from 'react';
import type { PlayerState } from '../types';
import { PlayIcon, PauseIcon, CloseIcon, SpeakerWaveIcon, SpeakerXMarkIcon, ArrowPathIcon } from './icons';

interface AudioPlayerProps {
  lectureTitle: string;
  playerState: PlayerState;
  onPlayPause: () => void;
  onClose: () => void;
  onSeek: (progress: number) => void;
  onVolumeChange: (volume: number) => void;
  onRetry?: () => void;
}

const formatTime = (seconds: number): string => {
  const flooredSeconds = Math.floor(seconds);
  const min = Math.floor(flooredSeconds / 60);
  const sec = flooredSeconds % 60;
  return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  lectureTitle,
  playerState,
  onPlayPause,
  onClose,
  onSeek,
  onVolumeChange,
  onRetry,
}) => {
  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSeek(parseFloat(e.target.value));
  };
  
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onVolumeChange(parseFloat(e.target.value));
  };

  const PlayerContent = () => {
      if (playerState.error) {
        return (
            <div className="bg-red-900/80 backdrop-blur-lg border-t border-red-700 p-4 shadow-2xl">
                <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex-grow">
                        <p className="text-sm font-semibold truncate text-white">{lectureTitle}</p>
                        <p className="text-sm text-red-300">{playerState.error}</p>
                    </div>
                    <div className="flex items-center gap-3">
                         {onRetry && (
                            <button 
                                onClick={playerState.isLoading ? undefined : onRetry} 
                                className="flex items-center gap-2 text-sm bg-slate-200 text-slate-900 font-semibold px-3 py-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-wait"
                                disabled={playerState.isLoading}
                            >
                                {playerState.isLoading ? (
                                    <div className="w-4 h-4 border-2 border-t-transparent border-slate-900 rounded-full animate-spin"></div>
                                ) : (
                                    <ArrowPathIcon className="w-4 h-4" />
                                )}
                                {playerState.isLoading ? 'Retrying...' : 'Retry'}
                            </button>
                         )}
                        <button onClick={onClose} className="p-2 rounded-full text-red-200 hover:bg-red-800 hover:text-white transition-colors">
                            <CloseIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        );
      }

      return (
         <div className="bg-slate-800/80 backdrop-blur-lg border-t border-slate-700 p-4 shadow-2xl">
            <div className="max-w-3xl mx-auto flex items-center gap-4">

            {/* Play/Pause Button */}
            <button onClick={onPlayPause} className="p-2 rounded-full bg-cyan-500 text-white hover:bg-cyan-600 transform transition-all duration-200 active:scale-95">
                {playerState.isPlaying ? <PauseIcon className="w-6 h-6"/> : <PlayIcon className="w-6 h-6" />}
            </button>

            {/* Lecture Info and Seek Bar */}
            <div className="flex-grow">
                <p className="text-sm font-semibold truncate text-white">{lectureTitle}</p>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400 w-10 text-center">{formatTime(playerState.currentTime)}</span>
                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.001"
                        value={playerState.progress}
                        onChange={handleSeekChange}
                        className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
                        style={{ backgroundSize: `${playerState.progress * 100}% 100%` }}
                    />
                    <span className="text-xs text-slate-400 w-10 text-center">{formatTime(playerState.duration)}</span>
                </div>
            </div>
            
            {/* Volume Control */}
            <div className="hidden sm:flex items-center gap-2 w-32">
                <button onClick={() => onVolumeChange(playerState.volume > 0 ? 0 : 1)}>
                    {playerState.volume > 0 ? <SpeakerWaveIcon className="w-5 h-5 text-slate-400" /> : <SpeakerXMarkIcon className="w-5 h-5 text-slate-400" />}
                </button>
                <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={playerState.volume}
                        onChange={handleVolumeChange}
                        className="w-full h-1.5 bg-slate-600 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-slate-300"
                    />
            </div>

            {/* Close Button */}
            <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-700 hover:text-white transition-colors">
                <CloseIcon className="w-5 h-5" />
            </button>
            </div>
        </div>
      );
  };


  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 player-enter">
      <PlayerContent />
    </div>
  );
};

export default AudioPlayer;