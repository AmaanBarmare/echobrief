import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { subDays, format, startOfDay, isSameDay } from 'date-fns';
import { Meeting } from '@/types/meeting';

interface MeetingsChartProps {
  meetings: Meeting[];
}

export function MeetingsChart({ meetings }: MeetingsChartProps) {
  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = startOfDay(subDays(new Date(), 6 - i));
      return {
        date,
        label: format(date, 'EEE'),
        fullDate: format(date, 'MMM d'),
        meetings: 0,
        minutes: 0,
      };
    });

    meetings.forEach((meeting) => {
      const meetingDate = startOfDay(new Date(meeting.start_time));
      const dayData = last7Days.find(d => isSameDay(d.date, meetingDate));
      if (dayData) {
        dayData.meetings += 1;
        dayData.minutes += Math.floor((meeting.duration_seconds || 0) / 60);
      }
    });

    return last7Days;
  }, [meetings]);

  const totalMinutes = chartData.reduce((sum, d) => sum + d.minutes, 0);
  const totalMeetings = chartData.reduce((sum, d) => sum + d.meetings, 0);

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-medium flex items-center justify-between">
          <span>This Week</span>
          <span className="text-sm font-normal text-muted-foreground">
            {totalMeetings} meetings · {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m recorded
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="meetingsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="label" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              />
              <YAxis 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                allowDecimals={false}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-lg shadow-lg p-3">
                        <p className="text-sm font-medium text-foreground">{data.fullDate}</p>
                        <p className="text-sm text-muted-foreground">
                          {data.meetings} meeting{data.meetings !== 1 ? 's' : ''} · {data.minutes}m
                        </p>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="meetings"
                stroke="hsl(var(--accent))"
                strokeWidth={2}
                fill="url(#meetingsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
