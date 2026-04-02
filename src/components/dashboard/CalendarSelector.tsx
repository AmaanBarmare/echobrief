import { useState } from 'react';
import { Check, ChevronDown, Plus, Trash2, AlertCircle } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface Calendar {
  id: string;
  provider: string;
  calendar_name: string;
  email?: string;
  is_primary: boolean;
  is_active: boolean;
}

interface CalendarSelectorProps {
  calendars: Calendar[];
  selectedCalendarIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onAddCalendar: () => void;
  onRemoveCalendar: (id: string) => void;
}

const providerIcons: Record<string, { color: string; label: string }> = {
  google: { color: '#4285F4', label: 'Google Calendar' },
  outlook: { color: '#0078D4', label: 'Outlook' },
  ical: { color: '#FF6B6B', label: 'iCal' },
  other: { color: '#9CA3AF', label: 'Other' },
};

export function CalendarSelector({
  calendars,
  selectedCalendarIds,
  onSelectionChange,
  onAddCalendar,
  onRemoveCalendar,
}: CalendarSelectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const handleToggleCalendar = (calendarId: string) => {
    if (selectedCalendarIds.includes(calendarId)) {
      onSelectionChange(selectedCalendarIds.filter((id) => id !== calendarId));
    } else {
      onSelectionChange([...selectedCalendarIds, calendarId]);
    }
  };

  const handleRemove = (e: React.MouseEvent, calendarId: string) => {
    e.stopPropagation();
    if (calendars.find((c) => c.id === calendarId)?.is_primary) {
      toast({
        title: 'Cannot remove',
        description: 'You cannot remove your primary calendar',
        variant: 'destructive',
      });
      return;
    }
    onRemoveCalendar(calendarId);
  };

  const selectedCount = selectedCalendarIds.length;
  const buttonText =
    selectedCount === 0
      ? 'Select calendars'
      : selectedCount === 1
        ? calendars.find((c) => c.id === selectedCalendarIds[0])?.calendar_name || 'Calendar'
        : `${selectedCount} calendars`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          style={{
            background: '#1C1917',
            border: '1px solid #292524',
            color: '#FAFAF9',
          }}
        >
          <span className="flex items-center gap-2">
            {selectedCount > 0 && (
              <Badge
                style={{
                  background: 'rgba(249, 115, 22, 0.2)',
                  color: '#FB923C',
                  borderColor: 'rgba(249, 115, 22, 0.3)',
                }}
                variant="outline"
              >
                {selectedCount}
              </Badge>
            )}
            <span>{buttonText}</span>
          </span>
          <ChevronDown size={16} />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        style={{
          background: '#1C1917',
          border: '1px solid #292524',
          borderRadius: 10,
        }}
        className="w-80"
      >
        {calendars.length === 0 ? (
          <div className="p-4 text-center" style={{ color: '#78716C' }}>
            <AlertCircle size={20} className="mx-auto mb-2 opacity-50" />
            <p className="text-sm mb-3">No calendars connected</p>
            <Button
              onClick={() => {
                setOpen(false);
                onAddCalendar();
              }}
              size="sm"
              className="w-full"
              style={{
                background: 'rgba(249, 115, 22, 0.1)',
                color: '#FB923C',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              <Plus size={14} className="mr-1" /> Connect Calendar
            </Button>
          </div>
        ) : (
          <>
            <div className="p-2">
              {calendars.map((calendar) => {
                const provider = providerIcons[calendar.provider] || providerIcons.other;
                const isSelected = selectedCalendarIds.includes(calendar.id);

                return (
                  <div
                    key={calendar.id}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-stone-900 cursor-pointer transition-colors"
                    onClick={() => handleToggleCalendar(calendar.id)}
                  >
                    <div
                      className="w-5 h-5 rounded border flex items-center justify-center flex-shrink-0"
                      style={{
                        border: `1px solid ${provider.color}`,
                        background: isSelected ? provider.color : 'transparent',
                      }}
                    >
                      {isSelected && <Check size={12} color="#fff" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-medium truncate"
                        style={{ color: '#FAFAF9' }}
                      >
                        {calendar.calendar_name}
                      </div>
                      <div
                        className="text-xs truncate"
                        style={{ color: '#78716C' }}
                      >
                        {calendar.email || provider.label}
                      </div>
                    </div>

                    {calendar.is_primary && (
                      <Badge
                        variant="outline"
                        className="text-[10px]"
                        style={{
                          background: 'rgba(34, 197, 94, 0.1)',
                          color: '#22C55E',
                          borderColor: 'rgba(34, 197, 94, 0.3)',
                        }}
                      >
                        Primary
                      </Badge>
                    )}

                    {!calendar.is_primary && (
                      <button
                        onClick={(e) => handleRemove(e, calendar.id)}
                        className="p-1 hover:bg-red-500/10 rounded transition-colors"
                        title="Remove calendar"
                      >
                        <Trash2 size={14} style={{ color: '#EF4444' }} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <DropdownMenuSeparator style={{ background: '#292524' }} />

            <DropdownMenuItem
              onClick={() => {
                setOpen(false);
                onAddCalendar();
              }}
              className="flex items-center gap-2 p-3 text-sm cursor-pointer hover:bg-stone-900"
              style={{ color: '#FB923C' }}
            >
              <Plus size={14} /> Add another calendar
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
