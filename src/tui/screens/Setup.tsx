import React, { useState, useEffect } from "react"
import { Box, Text, TextInput, CustomSelect, Spinner, useInput, type SelectProps } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey, detectProviderFromRemoteUrl } from "../../providers.js"
import { setup, readGitContext, type SetupOptions, type SetupResult } from "../../commands/setup.js"

type WizardStep = "provider" | "email" | "keyname" | "generate"

type Props = {
  onBack: () => void
}

const PROVIDER_OPTIONS = PROVIDER_KEYS.map(key => ({
  label: PROVIDERS[key].label,
  value: key,
  description: PROVIDERS[key].hostname,
}))

export function Setup({ onBack }: Props): React.ReactNode {
  const [step, setStep] = useState<WizardStep>("provider")
  const [provider, setProvider] = useState<ProviderKey>("github")
  const [email, setEmail] = useState("")
  const [emailCursor, setEmailCursor] = useState(0)
  const [keyName, setKeyName] = useState("")
  const [keyNameCursor, setKeyNameCursor] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const columns = process.stdout.columns ?? 80

  useEffect(() => {
    const ctx = readGitContext()
    if (ctx.email) {
      setEmail(ctx.email)
      setEmailCursor(ctx.email.length)
    }
    if (ctx.remoteUrl) {
      const detected = detectProviderFromRemoteUrl(ctx.remoteUrl)
      if (detected) setProvider(detected)
    }
  }, [])

  useEffect(() => {
    const defaultName = `id_${PROVIDERS[provider].keyType}_${provider}`
    setKeyName(defaultName)
    setKeyNameCursor(defaultName.length)
  }, [provider])

  useInput((_input, key) => {
    if (key.escape) onBack()
  }, { isActive: step !== "generate" && !generating })

  async function runSetup(): Promise<void> {
    setGenerating(true)
    setError(null)
    const opts: SetupOptions = { provider, email, keyName }
    try {
      const r = await setup(opts)
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setGenerating(false)
      setStep("generate")
    }
  }

  if (step === "provider") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 1 of 4 — Select provider" />
        <CustomSelect
          {...({
            options: PROVIDER_OPTIONS,
            defaultValue: provider,
            onChange: (value: ProviderKey) => {
              setProvider(value)
              setStep("email")
            },
            visibleOptionCount: 4,
          } satisfies SelectProps<ProviderKey>)}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (step === "email") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 2 of 4 — Enter email" />
        <Box flexDirection="row" gap={1}>
          <Text>Email:</Text>
          <TextInput
            value={email}
            onChange={setEmail}
            onSubmit={(v) => { if (v.trim()) setStep("keyname") }}
            placeholder="you@example.com"
            focus
            showCursor
            columns={columns}
            cursorOffset={emailCursor}
            onChangeCursorOffset={setEmailCursor}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to continue · Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (step === "keyname") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 3 of 4 — Key name" />
        <Box flexDirection="row" gap={1}>
          <Text>Key name:</Text>
          <TextInput
            value={keyName}
            onChange={setKeyName}
            onSubmit={(v) => {
              if (v.trim()) {
                setStep("generate")
                void runSetup()
              }
            }}
            placeholder={`id_ed25519_${provider}`}
            focus
            showCursor
            columns={columns}
            cursorOffset={keyNameCursor}
            onChangeCursorOffset={setKeyNameCursor}
          />
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Enter to generate key · Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (generating) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 4 of 4 — Generating key…" />
        <Spinner label={`Generating ${PROVIDERS[provider].keyType} key for ${PROVIDERS[provider].label}…`} />
      </Box>
    )
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Setup failed" />
        <Text color="red">{error}</Text>
        <Box marginTop={1}>
          <Text dimColor>Esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (result) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Setup complete!" />
        <Text color="green">Key generated: ~/.ssh/{result.keyName}</Text>
        <Text color="green">SSH config updated for {result.host}</Text>
        {result.clipboardCopied && <Text color="green">Public key copied to clipboard</Text>}
        {!result.clipboardCopied && <Text dimColor>Could not copy to clipboard — paste manually:</Text>}
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>Public key:</Text>
          <Text wrap="wrap">{result.publicKey}</Text>
        </Box>
        {result.browserOpened && <Text color="green">Opened {PROVIDERS[provider].settingsUrl}</Text>}
        <Box marginTop={1}>
          <Text dimColor>Esc to return to menu</Text>
        </Box>
      </Box>
    )
  }

  return null
}
