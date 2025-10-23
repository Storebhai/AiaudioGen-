import React, { useState, useEffect } from 'react';
import type { Lecture, Toast } from '../types';
import Modal from './Modal';
import { improveScript } from '../services/geminiService';

interface EditLectureModalProps {
  isOpen: boolean;
  onClose: () => void;
  lecture: Lecture | null;
  onSave: (updatedLecture: Lecture) => void;
  addToast: (message: string, type?: Toast['type']) => void;
}

const EditLectureModal: React.FC<EditLectureModalProps> = ({ isOpen, onClose, lecture, onSave, addToast }) => {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [script, setScript] = useState('');
  const [isImproving, setIsImproving] = useState(false);

  useEffect(() => {
    if (lecture) {
      setTitle(lecture.title);
      setSummary(lecture.summary);
      setScript(lecture.script);
    }
  }, [lecture]);

  if (!lecture) return null;

  const handleSave = () => {
    const updatedLecture = { ...lecture, title, summary, script };
    onSave(updatedLecture);
    onClose();
  };
  
  const handleImproveScript = async () => {
    if (!script.trim()) {
        addToast('Script is empty, nothing to improve.', 'info');
        return;
    }
    setIsImproving(true);
    try {
        const improvedScript = await improveScript(script);
        setScript(improvedScript);
        addToast('Script improved successfully!', 'success');
    } catch (error) {
        addToast(error instanceof Error ? error.message : 'An unknown error occurred.', 'error');
    } finally {
        setIsImproving(false);
    }
  };

  const footer = (
    <div className="flex justify-end gap-3">
      <button
        onClick={onClose}
        className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500 transition-colors font-semibold"
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        className="px-4 py-2 rounded-md bg-cyan-500 hover:bg-cyan-600 transition-colors font-bold text-white"
      >
        Save Changes
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Lecture" footer={footer}>
      <div className="space-y-4">
        <div>
          <label htmlFor="edit-title" className="block text-sm font-medium text-slate-300 mb-1">
            Title
          </label>
          <input
            id="edit-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
        <div>
          <label htmlFor="edit-summary" className="block text-sm font-medium text-slate-300 mb-1">
            Summary
          </label>
          <textarea
            id="edit-summary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={4}
            className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
        <div>
          <div className="flex justify-between items-center mb-1">
            <label htmlFor="edit-script" className="block text-sm font-medium text-slate-300">
              Script
            </label>
            <button
              onClick={handleImproveScript}
              disabled={isImproving}
              className="text-xs font-semibold flex items-center gap-1 text-cyan-400 hover:text-cyan-300 transition-colors disabled:opacity-50 disabled:cursor-wait"
            >
              {isImproving ? (
                <><div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"></div> Improving...</>
              ) : (
                '✨ Improve with AI'
              )}
            </button>
          </div>
          <textarea
            id="edit-script"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={10}
            className="w-full bg-slate-700 border border-slate-600 rounded-md px-3 py-2 text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
          />
        </div>
      </div>
    </Modal>
  );
};

export default EditLectureModal;