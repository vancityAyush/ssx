import React, { useState } from "react";
import { Box, CustomSelect, Spinner, Text, useInput } from "@vancityayush/tui";
import { testConnection, type TestResult } from "../../commands/test";
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey } from "../../providers";
import { Header } from "../components/Header";

type Props = {
  onBack: () => void;
};

type Phase = "select" | "testing" | "result";

const PROVIDER_OPTIONS = PROVIDER_KEYS.map(key => ({
  label: PROVIDERS[key].label,
  value: key,
  description: `ssh -T git@${PROVIDERS[key].hostname}`,
}));

export function TestConnection({ onBack }: Props): React.ReactNode {
  const [phase, setPhase] = useState<Phase>("select");
  const [provider, setProvider] = useState<ProviderKey>("github");
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (!key.escape || phase === "testing") {
      return;
    }

    if (phase === "result") {
      setPhase("select");
      setResult(null);
      setError(null);
      return;
    }

    onBack();
  });

  async function runTest(nextProvider: ProviderKey): Promise<void> {
    setProvider(nextProvider);
    setPhase("testing");
    setResult(null);
    setError(null);

    try {
      setResult(await testConnection(nextProvider));
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setPhase("result");
    }
  }

  if (phase === "select") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Select a provider to test" />
        <CustomSelect
          options={PROVIDER_OPTIONS}
          defaultValue={provider}
          onCancel={onBack}
          onChange={(value: ProviderKey) => {
            void runTest(value);
          }}
          visibleOptionCount={4}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc back</Text>
        </Box>
      </Box>
    );
  }

  if (phase === "testing") {
    return (
      <Box flexDirection="column">
        <Header subtitle={`Testing ${PROVIDERS[provider].label}`} />
        <Spinner label={`ssh -T git@${PROVIDERS[provider].hostname}`} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Header subtitle={`Result for ${PROVIDERS[provider].label}`} />
      {error ? <Text color="red">{error}</Text> : null}
      {result ? (
        <>
          <Text color={result.success ? "green" : "red"}>
            {result.success ? "Connection looks good." : "Connection test failed."}
          </Text>
          {result.output ? (
            <>
              <Text dimColor>Output</Text>
              <Text>{result.output}</Text>
            </>
          ) : null}
        </>
      ) : null}
      <Text dimColor>Esc choose another provider · Esc again back</Text>
    </Box>
  );
}
