# SigMap Query Context
Generated: 2026-05-10T02:26:16.648Z

## src/components/student/StudentExamPreview.tsx
```
component PreviewModal
component StudentExamPreviewInner
component StudentExamPreview
props StudentExamPreviewProps
hook useNavigate
hook useSearchParams
hook useStudentUI
hook useStudentTabletMode
hook useZoomScrollAnchoring
hook useMemo
hook useState
export StudentExamPreview
handler onClick
handler onChange
handler onExit
handler onClearHighlights
handler onHighlightModeToggle
handler onHighlightColorChange
handler onOpenNavigator
handler onAnswerChange
```

## src/components/student/normalizeReadingPassageText.ts
```
export function normalizeReadingPlainTextForDisplay(content) → string
export function normalizeReadingContentForHighlightText(content) → string
export function normalizeReadingContentForHighlightedFormattedText(content) → string
```

## src/components/student/highlightPalette.ts
```
export interface StudentHighlightPaletteEntry
id: StudentHighlightColor
label: string
swatchClassName: string
highlightClassName: string
highlightColorValue: string
export type StudentHighlightColor
export function getStudentHighlightPaletteEntry(color,) → StudentHighlightPaletteEntry
export function getStudentHighlightClassName(color) → string
export function getStudentHighlightColorValue(color) → string
```

## src/components/student/providers/StudentUIProvider.tsx
```
component StudentUIProvider
props UIProviderProps
hook useState
hook useCallback
hook useStudentUI
hook useContext
export StudentUIProvider
handler onReason
```

## src/components/student/StudentReading.tsx
```
component StudentReading
props StudentReadingProps
hook useMemo
hook useRef
hook useSplitPaneResize
hook useEffect
export StudentReading
handler onContainerRef
handler onMouseDown
handler onTouchStart
handler onId
handler onToggleFlag
handler onAnswerChange
handler onEntries
handler onClick
handler onChange
```
