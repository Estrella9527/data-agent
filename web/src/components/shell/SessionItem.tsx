"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import type { Session } from "@/types/session";
import { MessageSquare, Loader2, MoreHorizontal, Pin, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  onDelete: (id: string) => void;
  onPin: (id: string) => void;
  onUnpin: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

export function SessionItem({
  session,
  isActive,
  onClick,
  onDelete,
  onPin,
  onUnpin,
  onRename,
}: SessionItemProps) {
  const isProcessing = session.state !== "IDLE" && session.state !== "COMPLETED";
  const isPinned = !!session.pinnedAt;
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title || "");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(session.id, trimmed);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setRenameValue(session.title || "");
      setIsRenaming(false);
    }
  };

  return (
    <div
      onClick={isRenaming ? undefined : onClick}
      className={cn(
        "flex items-center gap-2.5 w-full pl-2 pr-3 py-2.5 rounded-[8px] text-left transition-[background-color] duration-75 group relative",
        isActive ? "bg-foreground-3" : "hover:bg-foreground-2",
        isRenaming ? "cursor-default" : "cursor-pointer"
      )}
    >
      {/* Selection indicator — Craft accent bar, outside rounded pill */}
      {isActive && (
        <div className="absolute -left-2 inset-y-1 w-[3px] bg-accent rounded-full" />
      )}

      {/* Status Icon */}
      <div className="flex-shrink-0">
        {isPinned ? (
          <Pin className="w-3.5 h-3.5 text-accent" />
        ) : isProcessing ? (
          <Loader2 className="w-3.5 h-3.5 text-accent animate-spin" />
        ) : (
          <MessageSquare className="w-3.5 h-3.5 text-foreground-30" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {isRenaming ? (
          <input
            ref={inputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={handleRenameKeyDown}
            className="w-full text-sm bg-transparent border-b border-accent outline-none text-foreground py-0"
          />
        ) : (
          <span
            className={cn(
              "text-sm truncate block font-sans",
              isActive ? "text-foreground font-medium" : "text-foreground-80"
            )}
          >
            {session.title || "新会话"}
          </span>
        )}
      </div>

      {/* ⋯ Menu — Craft pattern: opacity-0 + group-hover:opacity-100 */}
      <div
        className={cn(
          "flex-shrink-0 transition-opacity",
          menuOpen || deleteOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu modal onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <div className="p-1 rounded-[6px] border border-transparent hover:border-foreground/[0.06] hover:bg-foreground/[0.08] data-[state=open]:bg-foreground/[0.08] cursor-pointer transition-colors">
              <MoreHorizontal className="w-3.5 h-3.5 text-foreground-40" />
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4}>
            <DropdownMenuItem
              onClick={() => (isPinned ? onUnpin(session.id) : onPin(session.id))}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>{isPinned ? "取消置顶" : "置顶"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setRenameValue(session.title || "");
                setIsRenaming(true);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
              <span>重命名</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete confirmation dialog — Craft Dialog pattern */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除会话</DialogTitle>
            <DialogDescription>
              将永久删除「{session.title || "新会话"}」及其所有消息记录，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => setDeleteOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium border border-foreground/[0.15] bg-background hover:bg-foreground/[0.03] transition-colors"
            >
              取消
            </button>
            <button
              onClick={() => {
                onDelete(session.id);
                setDeleteOpen(false);
              }}
              className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium bg-destructive text-white hover:bg-destructive/90 transition-colors"
            >
              删除
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
