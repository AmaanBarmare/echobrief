import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Clock, CheckSquare, Lightbulb, MessageSquare, Play } from 'lucide-react';

interface MeetingTabsProps {
  children: {
    summary: React.ReactNode;
    timeline: React.ReactNode;
    actionItems: React.ReactNode;
    insights: React.ReactNode;
    transcript: React.ReactNode;
    recording: React.ReactNode;
  };
  defaultTab?: string;
}

export function MeetingTabs({ children, defaultTab = 'summary' }: MeetingTabsProps) {
  return (
    <Tabs defaultValue={defaultTab} className="w-full">
      <TabsList className="w-full justify-start border-b border-border rounded-none h-auto p-0 bg-transparent mb-6">
        <TabsTrigger 
          value="summary" 
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <FileText className="w-4 h-4" />
          Summary
        </TabsTrigger>
        <TabsTrigger 
          value="timeline"
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <Clock className="w-4 h-4" />
          Timeline
        </TabsTrigger>
        <TabsTrigger 
          value="action-items"
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <CheckSquare className="w-4 h-4" />
          Action Items
        </TabsTrigger>
        <TabsTrigger 
          value="insights"
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <Lightbulb className="w-4 h-4" />
          Insights
        </TabsTrigger>
        <TabsTrigger 
          value="transcript"
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <MessageSquare className="w-4 h-4" />
          Transcript
        </TabsTrigger>
        <TabsTrigger 
          value="recording"
          className="gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-accent data-[state=active]:bg-transparent px-4 py-2.5"
        >
          <Play className="w-4 h-4" />
          Recording
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="mt-0">
        {children.summary}
      </TabsContent>
      
      <TabsContent value="timeline" className="mt-0">
        {children.timeline}
      </TabsContent>
      
      <TabsContent value="action-items" className="mt-0">
        {children.actionItems}
      </TabsContent>
      
      <TabsContent value="insights" className="mt-0">
        {children.insights}
      </TabsContent>
      
      <TabsContent value="transcript" className="mt-0">
        {children.transcript}
      </TabsContent>
      
      <TabsContent value="recording" className="mt-0">
        {children.recording}
      </TabsContent>
    </Tabs>
  );
}
