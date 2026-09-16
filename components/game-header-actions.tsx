"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { MoreHorizontal, SquarePen, Trash2 } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { SidebarMenuAction } from "@/components/ui/sidebar"
import { renameGame, deleteGame } from "@/lib/games/actions"
import { cn } from "@/lib/utils"

export interface GameHeaderTitleProps {
  id: string
  initialTitle: string
  className?: string
}

export function GameHeaderTitle({
  id,
  initialTitle,
  className,
}: GameHeaderTitleProps) {
  const [title, setTitle] = React.useState(initialTitle)

  React.useEffect(() => {
    setTitle(initialTitle)
  }, [initialTitle])

  React.useEffect(() => {
    const handleTitleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>
      const { id: updatedId, title: updatedTitle } = customEvent.detail || {}
      if (updatedId === id && updatedTitle) {
        setTitle(updatedTitle)
      }
    }

    window.addEventListener("game-title-updated", handleTitleUpdate)
    return () => {
      window.removeEventListener("game-title-updated", handleTitleUpdate)
    }
  }, [id])

  return (
    <span
      className={cn(
        "text-sm font-medium text-foreground truncate mr-4",
        className
      )}
    >
      {title}
    </span>
  )
}

export interface GameHeaderActionsProps {
  id: string
  initialTitle: string
  hasSandbox?: boolean
  initialHasSandbox?: boolean
  className?: string
}

export function GameHeaderActions({
  id,
  initialTitle,
  hasSandbox: hasSandboxProp,
  initialHasSandbox = false,
  className,
}: GameHeaderActionsProps) {
  const router = useRouter()
  const effectiveInitialHasSandbox = hasSandboxProp ?? initialHasSandbox
  const [currentTitle, setCurrentTitle] = React.useState(initialTitle)
  const [hasSandbox, setHasSandbox] = React.useState(effectiveInitialHasSandbox)
  const [newTitle, setNewTitle] = React.useState(initialTitle)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [trashOpen, setTrashOpen] = React.useState(false)
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameError, setRenameError] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setHasSandbox(effectiveInitialHasSandbox)
  }, [effectiveInitialHasSandbox])

  React.useEffect(() => {
    const handleSandboxUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; sandboxId?: string }>)
        .detail
      if (detail?.sandboxId && (!detail.id || detail.id === id)) {
        setHasSandbox(true)
      }
    }

    window.addEventListener("game-sandbox-updated", handleSandboxUpdate)
    return () => {
      window.removeEventListener("game-sandbox-updated", handleSandboxUpdate)
    }
  }, [id])

  React.useEffect(() => {
    setCurrentTitle(initialTitle)
  }, [initialTitle])

  React.useEffect(() => {
    const handleTitleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>
      const { id: updatedId, title: updatedTitle } = customEvent.detail || {}
      if (updatedId === id && updatedTitle) {
        setCurrentTitle(updatedTitle)
      }
    }

    window.addEventListener("game-title-updated", handleTitleUpdate)
    return () => {
      window.removeEventListener("game-title-updated", handleTitleUpdate)
    }
  }, [id])

  React.useEffect(() => {
    if (renameOpen) {
      setNewTitle(currentTitle)
      setRenameError(null)
    }
  }, [renameOpen, currentTitle])

  React.useEffect(() => {
    if (trashOpen) {
      setDeleteError(null)
    }
  }, [trashOpen])

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed) {
      setRenameError("Project name cannot be empty")
      return
    }

    if (trimmed === currentTitle) {
      setRenameOpen(false)
      return
    }

    setIsRenaming(true)
    setRenameError(null)

    try {
      await renameGame(id, trimmed)
      setCurrentTitle(trimmed)
      window.dispatchEvent(
        new CustomEvent("game-title-updated", {
          detail: { id, title: trimmed },
        })
      )
      setRenameOpen(false)
      router.refresh()
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Failed to rename project"
      )
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteGame(id)
      window.dispatchEvent(
        new CustomEvent("game-deleted", {
          detail: { id },
        })
      )
      setTrashOpen(false)
      router.push("/")
      router.refresh()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete project"
      )
      setIsDeleting(false)
    }
  }

  return (
    <div className={cn("flex items-center shrink-0 ml-auto", className)}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8 text-muted-foreground hover:text-foreground"
              aria-label="Project actions"
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Project actions</span>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <SquarePen className="size-4" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 className="size-4" />
            <span>Trash</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Action Confirmation Dialog for Rename */}
      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!isRenaming) setRenameOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRename} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-rename-input">Project name</Label>
              <Input
                id="project-rename-input"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter project name"
                disabled={isRenaming}
                autoFocus
              />
              {renameError && (
                <p className="text-xs text-destructive">{renameError}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRenaming || !newTitle.trim()}
              >
                {isRenaming ? (
                  <>
                    <Spinner className="size-4" />
                    <span>Saving...</span>
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation AlertDialog for Trash */}
      <AlertDialog
        open={trashOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setTrashOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move project to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {hasSandbox ? (
                <>
                  This will permanently delete &ldquo;{currentTitle}&rdquo; and
                  its associated sandbox. This action cannot be undone.
                </>
              ) : (
                <>
                  This will permanently delete &ldquo;{currentTitle}&rdquo;.
                  This action cannot be undone.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner className="size-4" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export interface SidebarGameActionsProps {
  id: string
  title: string
  className?: string
}

export function SidebarGameActions({
  id,
  title,
  className,
}: SidebarGameActionsProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [currentTitle, setCurrentTitle] = React.useState(title)
  const [newTitle, setNewTitle] = React.useState(title)
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [trashOpen, setTrashOpen] = React.useState(false)
  const [isRenaming, setIsRenaming] = React.useState(false)
  const [renameError, setRenameError] = React.useState<string | null>(null)
  const [isDeleting, setIsDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setCurrentTitle(title)
  }, [title])

  React.useEffect(() => {
    const handleTitleUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<{ id?: string; title?: string }>
      const { id: updatedId, title: updatedTitle } = customEvent.detail || {}
      if (updatedId === id && updatedTitle) {
        setCurrentTitle(updatedTitle)
      }
    }

    window.addEventListener("game-title-updated", handleTitleUpdate)
    return () => {
      window.removeEventListener("game-title-updated", handleTitleUpdate)
    }
  }, [id])

  React.useEffect(() => {
    if (renameOpen) {
      setNewTitle(currentTitle)
      setRenameError(null)
    }
  }, [renameOpen, currentTitle])

  React.useEffect(() => {
    if (trashOpen) {
      setDeleteError(null)
    }
  }, [trashOpen])

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newTitle.trim()
    if (!trimmed) {
      setRenameError("Project name cannot be empty")
      return
    }

    if (trimmed === currentTitle) {
      setRenameOpen(false)
      return
    }

    setIsRenaming(true)
    setRenameError(null)

    try {
      await renameGame(id, trimmed)
      setCurrentTitle(trimmed)
      window.dispatchEvent(
        new CustomEvent("game-title-updated", {
          detail: { id, title: trimmed },
        })
      )
      setRenameOpen(false)
      router.refresh()
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Failed to rename project"
      )
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)

    try {
      await deleteGame(id)
      window.dispatchEvent(
        new CustomEvent("game-deleted", {
          detail: { id },
        })
      )
      setTrashOpen(false)
      if (pathname === `/games/${id}`) {
        router.push("/")
      }
      router.refresh()
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Failed to delete project"
      )
      setIsDeleting(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              showOnHover
              className={className}
              aria-label="Project actions"
            >
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Project actions</span>
            </SidebarMenuAction>
          }
        />
        <DropdownMenuContent side="right" align="start" className="w-40">
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <SquarePen className="size-4" />
            <span>Rename</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setTrashOpen(true)}
          >
            <Trash2 className="size-4" />
            <span>Trash</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Action Confirmation Dialog for Rename */}
      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!isRenaming) setRenameOpen(open)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
            <DialogDescription>
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRename} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`sidebar-rename-${id}`}>Project name</Label>
              <Input
                id={`sidebar-rename-${id}`}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Enter project name"
                disabled={isRenaming}
                autoFocus
              />
              {renameError && (
                <p className="text-xs text-destructive">{renameError}</p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameOpen(false)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRenaming || !newTitle.trim()}
              >
                {isRenaming ? (
                  <>
                    <Spinner className="size-4" />
                    <span>Saving...</span>
                  </>
                ) : (
                  "Save"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Action Confirmation AlertDialog for Trash */}
      <AlertDialog
        open={trashOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setTrashOpen(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move project to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;{currentTitle}&rdquo;. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError && (
            <p className="text-xs text-destructive">{deleteError}</p>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Spinner className="size-4" />
                  <span>Deleting...</span>
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

