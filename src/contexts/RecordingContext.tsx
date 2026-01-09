import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioLevel: number;
  meetingId: string | null;
  meetingTitle: string;
}

interface RecordingContextType extends RecordingState {
  startRecording: (meetingId: string, title: string) => Promise<void>;
  stopRecording: () => Promise<string | null>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  error: string | null;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'checking';
  requestPermissions: () => Promise<boolean>;
}

const RecordingContext = createContext<RecordingContextType | null>(null);

const STORAGE_KEY = 'echobrief_recording_state';

export function RecordingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'checking'>('checking');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Restore state from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const state = JSON.parse(stored);
        // Only restore if there was an active recording
        if (state.isRecording && state.meetingId) {
          setMeetingId(state.meetingId);
          setMeetingTitle(state.meetingTitle || '');
          setDuration(state.duration || 0);
          // Note: We can't restore the actual recording, just the UI state
          // The recording will need to be restarted
        }
      } catch (e) {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Persist state to localStorage
  useEffect(() => {
    if (isRecording) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        isRecording,
        isPaused,
        duration,
        meetingId,
        meetingTitle,
      }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [isRecording, isPaused, duration, meetingId, meetingTitle]);

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      setPermissionStatus('checking');
      
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      let systemStream: MediaStream | null = null;
      try {
        systemStream = await navigator.mediaDevices.getDisplayMedia({
          video: { width: 1, height: 1 },
          audio: true,
        });
        systemStream.getVideoTracks().forEach(track => track.stop());
      } catch (e) {
        console.log('System audio not available, using microphone only');
      }

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const destination = audioContext.createMediaStreamDestination();
      
      const micSource = audioContext.createMediaStreamSource(micStream);
      micSource.connect(destination);

      if (systemStream && systemStream.getAudioTracks().length > 0) {
        const systemSource = audioContext.createMediaStreamSource(systemStream);
        systemSource.connect(destination);
      }

      streamRef.current = destination.stream;
      
      analyserRef.current = audioContext.createAnalyser();
      analyserRef.current.fftSize = 256;
      micSource.connect(analyserRef.current);

      setPermissionStatus('granted');
      return true;
    } catch (err) {
      console.error('Permission error:', err);
      setPermissionStatus('denied');
      setError('Microphone permission denied. Please allow access to record meetings.');
      return false;
    }
  }, []);

  const updateAudioLevel = useCallback(() => {
    if (analyserRef.current && isRecording && !isPaused) {
      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average / 255);
      animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
    }
  }, [isRecording, isPaused]);

  const startRecording = useCallback(async (newMeetingId: string, title: string) => {
    if (!streamRef.current) {
      const granted = await requestPermissions();
      if (!granted) return;
    }

    if (!streamRef.current) {
      setError('No audio stream available');
      return;
    }

    setMeetingId(newMeetingId);
    setMeetingTitle(title);
    audioChunksRef.current = [];
    setError(null);
    setDuration(0);

    try {
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);

      updateAudioLevel();
    } catch (err) {
      console.error('Recording error:', err);
      setError('Failed to start recording');
    }
  }, [requestPermissions, updateAudioLevel]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || !meetingId || !user) {
        setIsRecording(false);
        setMeetingId(null);
        resolve(null);
        return;
      }

      const currentMeetingId = meetingId;
      const currentDuration = duration;

      mediaRecorderRef.current.onstop = async () => {
        if (durationIntervalRef.current) {
          clearInterval(durationIntervalRef.current);
        }

        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        try {
          const fileName = `${user.id}/${currentMeetingId}/${Date.now()}.webm`;
          const { error: uploadError } = await supabase.storage
            .from('recordings')
            .upload(fileName, audioBlob);

          if (uploadError) throw uploadError;

          await supabase
            .from('meetings')
            .update({ 
              audio_url: fileName,
              end_time: new Date().toISOString(),
              duration_seconds: currentDuration,
              status: 'processing'
            })
            .eq('id', currentMeetingId);

          setIsRecording(false);
          setIsPaused(false);
          setAudioLevel(0);
          setMeetingId(null);
          setMeetingTitle('');
          resolve(fileName);
        } catch (err) {
          console.error('Upload error:', err);
          setError('Failed to save recording');
          setIsRecording(false);
          setMeetingId(null);
          resolve(null);
        }
      };

      mediaRecorderRef.current.stop();
    });
  }, [user, meetingId, duration]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.pause();
      setIsPaused(true);
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
  }, [isRecording]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && isPaused) {
      mediaRecorderRef.current.resume();
      setIsPaused(false);
      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
      updateAudioLevel();
    }
  }, [isPaused, updateAudioLevel]);

  return (
    <RecordingContext.Provider value={{
      isRecording,
      isPaused,
      duration,
      audioLevel,
      meetingId,
      meetingTitle,
      startRecording,
      stopRecording,
      pauseRecording,
      resumeRecording,
      error,
      permissionStatus,
      requestPermissions,
    }}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const context = useContext(RecordingContext);
  if (!context) {
    throw new Error('useRecording must be used within a RecordingProvider');
  }
  return context;
}
