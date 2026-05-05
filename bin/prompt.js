/**
 * bin/prompt.js — Reusable TUI primitives built on @clack/prompts.
 *
 * Zero project-specific logic. Copy this file into any project.
 *
 * Exports:
 *   promptSelect(message, options)         → string (the selected value)
 *   promptMultiSelect(message, groups)     → string[] (selected values)
 *   promptConfirm(message, initial?)       → boolean
 *   withSpinner(message, fn)              → Promise<fn result>
 *   intro(title)
 *   outro(message)
 *   cancel(message)                        clean exit on Ctrl+C
 *   isTTY()                               → boolean — is stdin a real terminal?
 *
 * groupMultiSelect groups schema:
 *   [{ label: string, items: [{ value: string, label: string, hint?: string }] }]
 */

import * as clack from '@clack/prompts'

/**
 * Returns true when stdin is a real interactive terminal.
 * Returns false in CI, piped input, scripts.
 */
export function isTTY() {
  return clack.isTTY(process.stdin)
}

/**
 * Display a step-based intro banner.
 * @param {string} title
 */
export function intro(title) {
  clack.intro(title)
}

/**
 * Display a closing outro message.
 * @param {string} message
 */
export function outro(message) {
  clack.outro(message)
}

/**
 * Clean cancel — prints a cancel message and exits with code 1.
 * Call this when isCancel() returns true on any prompt.
 * @param {string} [message]
 */
export function cancel(message = 'Cancelled.') {
  clack.cancel(message)
  process.exit(1)
}

/**
 * Single-select prompt. Returns the selected value string.
 * Calls cancel() and exits if the user presses Ctrl+C.
 *
 * @param {string} message
 * @param {{ value: string, label: string, hint?: string }[]} options
 * @returns {Promise<string>}
 */
export async function promptSelect(message, options) {
  const result = await clack.select({
    message,
    options,
  })
  if (clack.isCancel(result)) cancel()
  return result
}

/**
 * Grouped multiselect prompt. Renders group headers between option groups.
 * All options are pre-selected by default (initialValues = all values).
 * Returns the array of selected value strings.
 * Calls cancel() and exits if the user presses Ctrl+C.
 *
 * @param {string} message
 * @param {{ label: string, items: { value: string, label: string, hint?: string }[] }[]} groups
 * @returns {Promise<string[]>}
 */
export async function promptMultiSelect(message, groups) {
  // @clack/prompts groupMultiselect expects:
  //   options: Record<string, { value, label, hint? }[]>
  // with the group label as the key.
  // The group order is preserved by insertion order.
  const options = {}
  const allValues = []
  for (const { label, items } of groups) {
    options[label] = items
    for (const item of items) allValues.push(item.value)
  }

  const result = await clack.groupMultiselect({
    message,
    options,
    initialValues: allValues,   // pre-select everything
    required: false,
  })
  if (clack.isCancel(result)) cancel()
  return result
}

/**
 * Yes/No confirm prompt. Returns a boolean.
 * Calls cancel() and exits if the user presses Ctrl+C.
 *
 * @param {string} message
 * @param {boolean} [initial=true]
 * @returns {Promise<boolean>}
 */
export async function promptConfirm(message, initial = true) {
  const result = await clack.confirm({ message, initialValue: initial })
  if (clack.isCancel(result)) cancel()
  return result
}

/**
 * Run an async function while showing a spinner.
 * The spinner starts with `message`, stops when fn resolves.
 * Returns the resolved value of fn.
 *
 * @param {string} message
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withSpinner(message, fn) {
  const s = clack.spinner()
  s.start(message)
  try {
    const result = await fn(s)
    s.stop()
    return result
  } catch (err) {
    s.error(err.message ?? 'Failed')
    throw err
  }
}

/**
 * Log an info line inside the wizard frame.
 * Renders as:  │  ℹ message
 * @param {string} message
 */
export function logInfo(message) {
  clack.log.info(message)
}
