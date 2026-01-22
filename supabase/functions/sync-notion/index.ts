import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

interface NotionPage {
  id: string;
  url: string;
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { meetingId, action } = await req.json();

    // Get Notion connection
    const { data: notionConnection, error: connectionError } = await supabase
      .from("notion_connections")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (connectionError || !notionConnection?.access_token) {
      return new Response(
        JSON.stringify({ error: "Notion not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const notionHeaders = {
      "Authorization": `Bearer ${notionConnection.access_token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    };

    if (action === "list_databases") {
      // List available databases for user to select
      const searchResponse = await fetch("https://api.notion.com/v1/search", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify({
          filter: { property: "object", value: "database" },
        }),
      });

      const searchData = await searchResponse.json();
      
      if (!searchResponse.ok) {
        throw new Error(searchData.message || "Failed to search Notion");
      }

      const databases = searchData.results.map((db: any) => ({
        id: db.id,
        title: db.title?.[0]?.plain_text || "Untitled",
        url: db.url,
      }));

      return new Response(
        JSON.stringify({ databases }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "save_settings") {
      const { reportsDatabaseId, tasksDatabaseId } = await req.json();
      
      await supabase
        .from("notion_connections")
        .update({
          reports_database_id: reportsDatabaseId,
          tasks_database_id: tasksDatabaseId,
        })
        .eq("user_id", user.id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync_meeting" && meetingId) {
      // Get meeting data
      const { data: meeting } = await supabase
        .from("meetings")
        .select("*")
        .eq("id", meetingId)
        .single();

      const { data: insights } = await supabase
        .from("meeting_insights")
        .select("*")
        .eq("meeting_id", meetingId)
        .single();

      if (!meeting || !insights) {
        return new Response(
          JSON.stringify({ error: "Meeting or insights not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let reportPage: NotionPage | null = null;

      // Create meeting report page
      if (notionConnection.reports_database_id) {
        const reportBlocks = buildReportBlocks(meeting, insights);
        
        const createPageResponse = await fetch("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: notionHeaders,
          body: JSON.stringify({
            parent: { database_id: notionConnection.reports_database_id },
            properties: {
              Name: { title: [{ text: { content: meeting.title } }] },
              Date: { date: { start: meeting.start_time } },
              Status: { select: { name: meeting.status || "completed" } },
            },
            children: reportBlocks,
          }),
        });

        const pageData = await createPageResponse.json();
        if (createPageResponse.ok) {
          reportPage = { id: pageData.id, url: pageData.url };
        }
      }

      // Sync action items to tasks database
      const syncedTasks: string[] = [];
      if (notionConnection.tasks_database_id && insights.action_items) {
        for (const item of insights.action_items as any[]) {
          const task = typeof item === 'string' ? item : item.task;
          const priority = typeof item === 'object' ? item.priority : undefined;
          const owner = typeof item === 'object' ? item.owner : undefined;

          const createTaskResponse = await fetch("https://api.notion.com/v1/pages", {
            method: "POST",
            headers: notionHeaders,
            body: JSON.stringify({
              parent: { database_id: notionConnection.tasks_database_id },
              properties: {
                Name: { title: [{ text: { content: task } }] },
                Status: { select: { name: "To Do" } },
                Priority: priority ? { select: { name: priority } } : undefined,
                Assignee: owner ? { rich_text: [{ text: { content: owner } }] } : undefined,
                Meeting: reportPage ? { relation: [{ id: reportPage.id }] } : undefined,
              },
            }),
          });

          if (createTaskResponse.ok) {
            syncedTasks.push(task);
          }
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          reportPage,
          syncedTasks: syncedTasks.length,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Notion sync error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Sync failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildReportBlocks(meeting: any, insights: any) {
  const blocks: any[] = [];

  // Executive Summary
  blocks.push({
    object: "block",
    type: "heading_2",
    heading_2: { rich_text: [{ type: "text", text: { content: "📝 Executive Summary" } }] },
  });
  blocks.push({
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: insights.summary_short || "" } }] },
  });

  // Key Points
  if (insights.key_points?.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "🎯 Key Points" } }] },
    });
    for (const point of insights.key_points) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: point } }] },
      });
    }
  }

  // Action Items
  if (insights.action_items?.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "✅ Action Items" } }] },
    });
    for (const item of insights.action_items) {
      const task = typeof item === 'string' ? item : item.task;
      const owner = typeof item === 'object' && item.owner ? ` → ${item.owner}` : '';
      blocks.push({
        object: "block",
        type: "to_do",
        to_do: { 
          rich_text: [{ type: "text", text: { content: `${task}${owner}` } }],
          checked: false,
        },
      });
    }
  }

  // Decisions
  if (insights.decisions?.length > 0) {
    blocks.push({
      object: "block",
      type: "heading_2",
      heading_2: { rich_text: [{ type: "text", text: { content: "📋 Decisions" } }] },
    });
    for (const decision of insights.decisions) {
      blocks.push({
        object: "block",
        type: "bulleted_list_item",
        bulleted_list_item: { rich_text: [{ type: "text", text: { content: decision } }] },
      });
    }
  }

  return blocks;
}
