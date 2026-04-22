import React, { useState } from "react"
import { Box, CustomSelect, Spinner, Text, useInput, type SelectProps } from "@vancityayush/tui"
import { Header } from "../components/Header.js"
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey } from "../../providers.js"
import { testConnection, type TestResult } from "../../commands/test.js"

type Props = {
  onBack: () => void
}

const PROVIDER_OPTIONS = PROVIDER_KEYS.map((key) => ({
  label: PROVIDERS[key].label,
  value: key,
  description: PROVIDERS[key].hostname,
}))

export function TestConnection({ onBack }: Props): React.ReactNode {
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>("github")
  const [result, setResult] = useState<TestResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  useInput((input, key) => {
    if (key.escape) {
      onBack()
      return
    }
    if (!running && result && input === "r") {
      setResult(null)
      setError(null)
    }
  })

  async function run(provider: ProviderKey): Promise<void> {
    setSelectedProvider(provider)
    setRunning(true)
    setResult(null)
    setError(null)

    try {
      setResult(await testConnection(provider))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setRunning(false)
    }
  }

  if (running) {
    return (
      <Box flexDirection="column">
        <Header subtitle={`Testing ${PROVIDERS[selectedProvider].label} connection`} />
        <Spinner label={`Running ssh -T against ${PROVIDERS[selectedProvider].hostname}…`} />
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Header subtitle="Test SSH connection" />

      {!result && !error && (
        <>
          <CustomSelect
            {...({
              options: PROVIDER_OPTIONS,
              defaultValue: selectedProvider,
              onChange: (value: ProviderKey) => {
                void run(value)
              },
              visibleOptionCount: 4,
            } satisfies SelectProps<ProviderKey>)}
          />
          <Box marginTop={1}>
            <Text dimColor>Choose a provider to run `ssh -T` · Esc back</Text>
          </Box>
        </>
      )}

      {error && (
        <>
          <Text color="red">{error}</Text>
          <Box marginTop={1}>
            <Text dimColor>r retry · Esc back</Text>
          </Box>
        </>
      )}

      {result && (
        <>
          <Text color={result.success ? "green" : "yellow"}>
            {result.success ? "Connection looks good." : "Connection failed or needs attention."}
          </Text>
          <Box marginTop={1}>
            <Text wrap="wrap">{result.output || "No output returned."}</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>r test another provider · Esc back</Text>
          </Box>
        </>
      )}
    </Box>
  )
}
