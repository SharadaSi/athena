// Custom input for the chartEmbed.height field.
//
// Responsibility:
// - Watch the sibling `file` (uploaded HTML diagram) on the parent chartEmbed object.
// - When the file changes, fetch the HTML, render it inside a hidden measurement
//   iframe, and write the resulting scrollHeight back into the `height` field.
// - Editors can still override the value manually or trigger a re-measure on demand.
//
// Why measure on the client side (in the Studio) rather than at render time:
// - On the public site the chart iframe is sandboxed without `allow-same-origin`,
//   so the parent page cannot read its document height directly. Measuring here,
//   while we have a privileged Studio context, lets us persist a known-good
//   height to the dataset and keep the public renderer simple and CSP-friendly.

import {useCallback, useEffect, useRef, useState} from 'react'
import {Box, Button, Flex, Stack, Text, TextInput, useToast} from '@sanity/ui'
import {set, unset, useClient, useFormValue, type NumberInputProps} from 'sanity'

// Width used inside the measurement iframe. Matches the typical rendered width
// of the article column on the public site, so charts using viewport-relative
// units settle on a representative layout before we read scrollHeight.
const MEASURE_WIDTH_PX = 800

// Delay after the iframe `load` event before reading the height. Many charting
// libraries (Chart.js, ECharts, D3 with transitions, …) only finish painting
// on the next animation frame(s); 900 ms is a pragmatic safety margin without
// being noticeable to editors.
const SETTLE_DELAY_MS = 900

// Round the measured value up to the nearest 10 px so the persisted number is
// stable across small re-renders / font-loading jitter.
function roundUp(value: number, step = 10): number {
  return Math.ceil(value / step) * step
}

export function ChartHeightInput(props: NumberInputProps) {
  const {value, onChange, elementProps, path} = props

  // The chartEmbed object lives one level above the `height` leaf.
  const parentPath = path.slice(0, -1)
  const parent = useFormValue(parentPath) as
    | {file?: {asset?: {_ref?: string}}}
    | undefined
  const fileRef = parent?.file?.asset?._ref

  const client = useClient({apiVersion: '2023-10-01'})
  const toast = useToast()

  const [measuring, setMeasuring] = useState(false)
  // Track which fileRef was last auto-measured so we only auto-run once per
  // upload and don't fight an editor who manually edits the number afterward.
  const lastAutoRef = useRef<string | null>(null)

  const measure = useCallback(async () => {
    if (!fileRef) return
    setMeasuring(true)

    let iframe: HTMLIFrameElement | null = null
    try {
      // Resolve the uploaded asset's CDN URL.
      const asset = await client.fetch<{url?: string} | null>(
        '*[_id == $id][0]{url}',
        {id: fileRef},
      )
      if (!asset?.url) throw new Error('Could not resolve file asset URL')

      const res = await fetch(asset.url, {credentials: 'omit'})
      if (!res.ok) throw new Error(`Fetch failed: HTTP ${res.status}`)
      const html = await res.text()

      // Build an off-screen iframe sized to the article column. We grant
      // `allow-same-origin` here ONLY because we need to read scrollHeight
      // from the parent; this is acceptable in the Studio (authenticated
      // editor context) but is intentionally NOT done on the public site.
      iframe = document.createElement('iframe')
      iframe.setAttribute('aria-hidden', 'true')
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin')
      Object.assign(iframe.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: `${MEASURE_WIDTH_PX}px`,
        height: '100px',
        border: '0',
        visibility: 'hidden',
        pointerEvents: 'none',
      })

      const loaded = new Promise<void>((resolve, reject) => {
        iframe!.addEventListener('load', () => resolve(), {once: true})
        iframe!.addEventListener(
          'error',
          () => reject(new Error('iframe failed to load')),
          {once: true},
        )
      })

      iframe.srcdoc = html
      document.body.appendChild(iframe)
      await loaded
      // Give scripts/fonts time to paint before measuring.
      await new Promise((r) => setTimeout(r, SETTLE_DELAY_MS))

      const doc = iframe.contentDocument
      if (!doc) throw new Error('iframe document not accessible')

      const measured = Math.max(
        doc.documentElement?.scrollHeight ?? 0,
        doc.body?.scrollHeight ?? 0,
        doc.documentElement?.offsetHeight ?? 0,
        doc.body?.offsetHeight ?? 0,
      )

      if (!measured || !Number.isFinite(measured)) {
        throw new Error('Could not determine content height')
      }

      // Clamp to the schema's accepted range (100–4000) just in case.
      const clamped = Math.min(4000, Math.max(100, roundUp(measured)))

      onChange(set(clamped))
      lastAutoRef.current = fileRef
      toast.push({
        status: 'success',
        title: 'Chart height measured',
        description: `Set to ${clamped}px`,
      })
    } catch (err) {
      console.error('[ChartHeightInput] measurement failed', err)
      toast.push({
        status: 'warning',
        title: 'Could not auto-measure chart height',
        description:
          err instanceof Error ? err.message : 'Please set the height manually.',
      })
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe)
      setMeasuring(false)
    }
  }, [client, fileRef, onChange, toast])

  // Auto-measure when a new file is uploaded. We only auto-run for a given
  // fileRef once, so editor overrides of the resulting number are preserved.
  useEffect(() => {
    if (!fileRef) return
    if (lastAutoRef.current === fileRef) return
    // Skip auto-measure if the editor already typed a custom value AND the
    // file hasn't changed since the component mounted with that value.
    // First mount with a pre-existing value: just record it as "seen".
    if (lastAutoRef.current === null && value && value > 0) {
      lastAutoRef.current = fileRef
      return
    }
    measure()
  }, [fileRef, measure, value])

  return (
    <Stack space={2}>
      <Flex gap={2} align="center">
        <Box flex={1}>
          <TextInput
            {...elementProps}
            type="number"
            inputMode="numeric"
            value={value ?? ''}
            onChange={(event) => {
              const next = event.currentTarget.value
              if (next === '') {
                onChange(unset())
              } else {
                const n = Number(next)
                onChange(Number.isFinite(n) ? set(n) : unset())
              }
            }}
          />
        </Box>
        <Button
          mode="ghost"
          text={measuring ? 'Measuring…' : 'Re-measure'}
          onClick={() => {
            // Force a re-run even if we've already measured this fileRef.
            lastAutoRef.current = null
            void measure()
          }}
          disabled={!fileRef || measuring}
        />
      </Flex>
      <Text size={1} muted>
        Height is measured automatically from the uploaded HTML file. Use
        “Re-measure” after editing the file, or type a value to override.
      </Text>
    </Stack>
  )
}
