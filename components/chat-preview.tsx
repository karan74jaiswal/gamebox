"use client"

import * as React from "react"

export interface ChatPreviewProps {
  className?: string
  children?: React.ReactNode
}

export function ChatPreview({
  className,
  children = "Chat preview",
}: ChatPreviewProps = {}) {
  return <p className={className}>{children}</p>
}

export default ChatPreview
