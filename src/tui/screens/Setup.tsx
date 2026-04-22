import React, { useEffect, useState } from "react";
import { Box, CustomSelect, Spinner, Text, TextInput, useInput } from "@vancityayush/tui";
import { readGitContext, setup, type SetupResult } from "../../commands/setup";
import { PROVIDER_KEYS, PROVIDERS, type ProviderKey } from "../../providers";
import { Header } from "../components/Header";

type WizardStep = "provider" | "email" | "keyname" | "result";

type Props = {
  onBack: () => void;
};

const INPUT_COLUMNS = 52;
const PROVIDER_OPTIONS = PROVIDER_KEYS.map(key => ({
  label: PROVIDERS[key].label,
  value: key,
  description: PROVIDERS[key].hostname,
}));

export function Setup({ onBack }: Props): React.ReactNode {
  const [step, setStep] = useState<WizardStep>("provider");
  const [provider, setProvider] = useState<ProviderKey>("github");
  const [email, setEmail] = useState("");
  const [emailCursor, setEmailCursor] = useState(0);
  const [keyName, setKeyName] = useState("");
  const [keyNameCursor, setKeyNameCursor] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SetupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const gitContext = readGitContext();
    if (gitContext.provider) {
      setProvider(gitContext.provider);
    }
    if (gitContext.email) {
      setEmail(gitContext.email);
      setEmailCursor(gitContext.email.length);
    }
  }, []);

  useEffect(() => {
    const defaultKeyName = `id_${PROVIDERS[provider].keyType}_${provider}`;
    setKeyName(defaultKeyName);
    setKeyNameCursor(defaultKeyName.length);
  }, [provider]);

  useInput((_input, key) => {
    if (!key.escape || generating) {
      return;
    }

    if (step === "provider") {
      onBack();
      return;
    }

    if (step === "email") {
      setStep("provider");
      return;
    }

    if (step === "keyname") {
      setStep("email");
      return;
    }

    onBack();
  });

  async function runSetup(): Promise<void> {
    if (!email.trim()) {
      setError("Email is required.");
      setStep("result");
      return;
    }

    if (!keyName.trim()) {
      setError("Key name is required.");
      setStep("result");
      return;
    }

    setGenerating(true);
    setResult(null);
    setError(null);
    setStep("result");

    try {
      const nextResult = await setup({
        provider,
        email: email.trim(),
        keyName: keyName.trim(),
      });
      setResult(nextResult);
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : String(setupError));
    } finally {
      setGenerating(false);
    }
  }

  if (step === "provider") {
    return (
      <Box flexDirection="column">
        <Header subtitle="Step 1 of 3: choose a provider" />
        <CustomSelect
          options={PROVIDER_OPTIONS}
          defaultValue={provider}
          onCancel={onBack}
          onChange={(value: ProviderKey) => {
            setProvider(value);
            setStep("email");
          }}
          visibleOptionCount={4}
        />
        <Box marginTop={1}>
          <Text dimColor>Esc back</Text>
        </Box>
      </Box>
    );
  }

  if (step === "email") {
    return (
      <Box flexDirection="column" gap={1}>
        <Header subtitle="Step 2 of 3: email comment" />
        <Text>Email</Text>
        <TextInput
          value={email}
          onChange={setEmail}
          onSubmit={value => {
            if (value.trim()) {
              setStep("keyname");
            }
          }}
          onExit={() => setStep("provider")}
          placeholder="you@example.com"
          focus
          showCursor
          columns={INPUT_COLUMNS}
          cursorOffset={emailCursor}
          onChangeCursorOffset={setEmailCursor}
        />
        <Text dimColor>Enter continue · Esc back</Text>
      </Box>
    );
  }

  if (step === "keyname") {
    return (
      <Box flexDirection="column" gap={1}>
        <Header subtitle="Step 3 of 3: key file name" />
        <Text>Key name</Text>
        <TextInput
          value={keyName}
          onChange={setKeyName}
          onSubmit={value => {
            if (value.trim()) {
              void runSetup();
            }
          }}
          onExit={() => setStep("email")}
          placeholder={`id_${PROVIDERS[provider].keyType}_${provider}`}
          focus
          showCursor
          columns={INPUT_COLUMNS}
          cursorOffset={keyNameCursor}
          onChangeCursorOffset={setKeyNameCursor}
        />
        <Text dimColor>Enter generate · Esc back</Text>
      </Box>
    );
  }

  if (generating) {
    return (
      <Box flexDirection="column">
        <Header subtitle="Generating key and updating SSH config" />
        <Spinner label={`Generating ${PROVIDERS[provider].keyType} key for ${PROVIDERS[provider].label}...`} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" gap={1}>
      <Header subtitle={error ? "Setup failed" : "Setup complete"} />
      {error ? <Text color="red">{error}</Text> : null}
      {result ? (
        <>
          <Text color="green">Created ~/.ssh/{result.keyName}</Text>
          <Text color="green">Updated SSH config for {result.host}</Text>
          {result.clipboardCopied ? (
            <Text color="green">Copied the public key to your clipboard.</Text>
          ) : (
            <Text dimColor>Clipboard copy was unavailable. Paste the key manually.</Text>
          )}
          {result.browserOpened ? (
            <Text color="green">Opened the provider SSH keys page.</Text>
          ) : (
            <Text dimColor>Browser open was unavailable.</Text>
          )}
          <Text dimColor>Public key</Text>
          <Text>{result.publicKey}</Text>
        </>
      ) : null}
      <Text dimColor>Esc return to menu</Text>
    </Box>
  );
}
