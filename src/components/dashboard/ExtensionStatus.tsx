import { useState, useEffect } from 'react';
import { Chrome, CheckCircle2, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ExtensionState = 'checking' | 'not_installed' | 'idle' | 'recording' | 'error';

interface ExtensionStatusProps {
  className?: string;
}

export function ExtensionStatus({ className }: ExtensionStatusProps) {
  const [state, setState] = useState<ExtensionState>('checking');
  const [recordingInfo, setRecordingInfo] = useState<{
    title?: string;
    duration?: number;
  }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkExtensionStatus();
    
    // Poll for status updates every 2 seconds
    const interval = setInterval(checkExtensionStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const checkExtensionStatus = async () => {
    try {
      // Try to communicate with the extension via a custom event
      const extensionId = await detectExtension();
      
      if (!extensionId) {
        setState('not_installed');
        return;
      }

      // Extension is installed, check recording status
      const status = await getExtensionStatus();
      
      if (status.error) {
        setState('error');
        setError(status.error);
      } else if (status.isRecording) {
        setState('recording');
        setRecordingInfo({
          title: status.meetingTitle,
          duration: status.duration
        });
      } else {
        setState('idle');
      }
    } catch (err) {
      setState('not_installed');
    }
  };

  const detectExtension = (): Promise<string | null> => {
    return new Promise((resolve) => {
      // Check if extension injected a marker element
      const marker = document.getElementById('echobrief-extension-marker');
      if (marker) {
        resolve(marker.dataset.extensionId || 'detected');
        return;
      }
      
      // Try postMessage communication
      const timeout = setTimeout(() => resolve(null), 500);
      
      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'ECHOBRIEF_EXTENSION_PONG') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.extensionId || 'detected');
        }
      };
      
      window.addEventListener('message', handler);
      window.postMessage({ type: 'ECHOBRIEF_EXTENSION_PING' }, '*');
    });
  };

  const getExtensionStatus = (): Promise<{
    isRecording: boolean;
    meetingTitle?: string;
    duration?: number;
    error?: string;
  }> => {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ isRecording: false });
      }, 500);

      const handler = (event: MessageEvent) => {
        if (event.data?.type === 'ECHOBRIEF_STATUS_RESPONSE') {
          clearTimeout(timeout);
          window.removeEventListener('message', handler);
          resolve(event.data.status);
        }
      };

      window.addEventListener('message', handler);
      window.postMessage({ type: 'ECHOBRIEF_GET_STATUS' }, '*');
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (state === 'checking') {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Checking extension...</span>
      </div>
    );
  }

  if (state === 'not_installed') {
    return (
      <div className={cn("p-4 rounded-lg bg-warning/10 border border-warning/30", className)}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-medium text-foreground text-sm">Chrome Extension Not Detected</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Install the EchoBrief extension to auto-record Google Meet and Zoom Web meetings.
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3 gap-2 h-8 text-xs"
              onClick={() => window.open('/chrome-extension-guide', '_blank')}
            >
              <Chrome className="w-3.5 h-3.5" />
              Installation Guide
              <ExternalLink className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={cn("flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30", className)}>
        <AlertCircle className="w-4 h-4 text-destructive" />
        <span className="text-sm text-destructive">{error || 'Extension error'}</span>
      </div>
    );
  }

  if (state === 'recording') {
    return (
      <div className={cn("p-4 rounded-lg bg-recording/10 border border-recording/30", className)}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-recording animate-pulse" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Chrome Extension Recording
            </p>
            {recordingInfo.title && (
              <p className="text-xs text-muted-foreground truncate">{recordingInfo.title}</p>
            )}
          </div>
          {recordingInfo.duration !== undefined && (
            <span className="font-mono text-sm font-medium text-foreground">
              {formatDuration(recordingInfo.duration)}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Idle state - extension installed and ready
  return (
    <div className={cn("flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/30", className)}>
      <CheckCircle2 className="w-4 h-4 text-success" />
      <span className="text-sm text-foreground">Chrome auto-recording enabled</span>
    </div>
  );
}