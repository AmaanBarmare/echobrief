-- Enable Supabase Realtime on the meetings table so the frontend can
-- subscribe to status changes instead of polling check-recall-status
-- every 5 seconds (which was depleting Disk IO budget).
ALTER PUBLICATION supabase_realtime ADD TABLE meetings;
