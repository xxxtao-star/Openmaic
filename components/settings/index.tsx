'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, XCircle, Box, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/lib/hooks/use-i18n';
import { useSettingsStore } from '@/lib/store/settings';
import { toast } from 'sonner';
import { type ProviderId, PROVIDERS, MONO_LOGO_PROVIDERS } from '@/lib/ai/providers';
import { cn } from '@/lib/utils';
import { getProviderTypeLabel } from './utils';
import { ProviderConfigPanel } from './provider-config-panel';
import { ModelEditDialog } from './model-edit-dialog';
import type { SettingsSection, EditingModel } from '@/lib/types/settings';

// This dialog only surfaces the language-model (LLM) channel. The media, audio,
// parsing and web-search sections that used to live behind the sidebar were
// removed: the product ships a single domestic-model channel, so the panel is
// the whole dialog. The provider switcher went with them — the dialog always
// shows the one channel, so there is nothing left to switch between. That also
// means the channel shown is the *selected* one from the store, not a local tab
// state: `providerId` is the only source of truth and the store re-resolves it
// whenever the config changes (#580).

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Accepted for call-site compatibility (the model selector and generation
   * toolbar pass the section they were opened from) but no longer used — the
   * dialog always shows the language-model channel.
   */
  initialSection?: SettingsSection;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useI18n();

  // Get settings from store
  const providerId = useSettingsStore((state) => state.providerId);
  const providersConfig = useSettingsStore((state) => state.providersConfig);

  // Store actions
  const setProviderConfig = useSettingsStore((state) => state.setProviderConfig);

  // Model editing state
  const [editingModel, setEditingModel] = useState<EditingModel | null>(null);
  const [showModelDialog, setShowModelDialog] = useState(false);

  // Save status indicator
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const handleSave = () => {
    onOpenChange(false);
  };

  const handleProviderConfigChange = (
    pid: ProviderId,
    apiKey: string,
    baseUrl: string,
    requiresApiKey: boolean,
  ) => {
    setProviderConfig(pid, {
      apiKey,
      baseUrl,
      requiresApiKey,
    });
  };

  const handleProviderConfigSave = () => {
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const config = providersConfig[providerId];
  // The dialog exposes the one channel the store has selected — there is no
  // local tab state left to disagree with it.
  const selectedProvider = config
    ? {
        id: providerId,
        name: config.name,
        type: config.type,
        defaultBaseUrl: config.defaultBaseUrl,
        baseUrlPlaceholder: PROVIDERS[providerId]?.baseUrlPlaceholder,
        supportsModelDiscovery: PROVIDERS[providerId]?.supportsModelDiscovery,
        alternateBaseUrls: PROVIDERS[providerId]?.alternateBaseUrls,
        icon: config.icon,
        requiresApiKey: config.requiresApiKey,
        models: config.models,
      }
    : undefined;

  // Handle model editing
  const handleEditModel = (pid: ProviderId, modelIndex: number) => {
    const allModels = providersConfig[pid]?.models || [];
    setEditingModel({
      providerId: pid,
      modelIndex,
      model: { ...allModels[modelIndex] },
    });
    setShowModelDialog(true);
  };

  const handleAddModel = () => {
    setEditingModel({
      providerId,
      modelIndex: null,
      model: {
        id: '',
        name: '',
        capabilities: {
          streaming: true,
          tools: true,
          vision: false,
        },
      },
    });
    setShowModelDialog(true);
  };

  const handleDeleteModel = (pid: ProviderId, modelIndex: number) => {
    const currentModels = providersConfig[pid]?.models || [];
    const newModels = currentModels.filter((_, i) => i !== modelIndex);
    setProviderConfig(pid, { models: newModels });
  };

  const handleAutoSaveModel = () => {
    if (!editingModel) return;
    const { providerId: pid, modelIndex, model } = editingModel;
    if (!model.id.trim()) return;
    const currentModels = providersConfig[pid]?.models || [];
    let newModels: typeof currentModels;
    let newModelIndex = modelIndex;

    if (modelIndex === null) {
      const existingIndex = currentModels.findIndex((m) => m.id === model.id);
      if (existingIndex >= 0) {
        newModels = [...currentModels];
        newModels[existingIndex] = model;
        newModelIndex = existingIndex;
      } else {
        newModels = [...currentModels, model];
        newModelIndex = newModels.length - 1;
      }
      setProviderConfig(pid, { models: newModels });
      setEditingModel({ ...editingModel, modelIndex: newModelIndex });
    } else {
      newModels = [...currentModels];
      newModels[modelIndex] = model;
      setProviderConfig(pid, { models: newModels });
    }
  };

  const handleSaveModel = () => {
    if (!editingModel) return;
    const { providerId: pid, modelIndex, model } = editingModel;
    if (!model.id.trim()) {
      toast.error(t('settings.modelIdRequired'));
      return;
    }
    const currentModels = providersConfig[pid]?.models || [];
    let newModels: typeof currentModels;
    if (modelIndex === null) {
      newModels = [...currentModels, model];
    } else {
      newModels = [...currentModels];
      newModels[modelIndex] = model;
    }
    setProviderConfig(pid, { models: newModels });
    setShowModelDialog(false);
    setEditingModel(null);
  };

  const handleResetProvider = (pid: ProviderId) => {
    const provider = PROVIDERS[pid];
    if (!provider) return;
    setProviderConfig(pid, { models: [...provider.models] });
    toast.success(t('settings.resetSuccess'));
  };

  // Header for the single channel this dialog exposes.
  const getHeaderContent = () => {
    if (!selectedProvider) return null;
    return (
      <>
        {selectedProvider.icon ? (
          <img
            src={selectedProvider.icon}
            alt={selectedProvider.name}
            className={cn(
              'w-8 h-8 rounded',
              MONO_LOGO_PROVIDERS.has(selectedProvider.id) && 'dark:invert',
            )}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <Box className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <h2 className="text-lg font-semibold">
            {/* Built-in providers use the registry name so an i18n entry can't
                pin a stale brand name over `provider.name`. */}
            {PROVIDERS[selectedProvider.id as ProviderId]?.name ?? selectedProvider.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            {getProviderTypeLabel(selectedProvider.type, t)}
          </p>
        </div>
      </>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80vh] p-0 gap-0 block sm:max-w-2xl" showCloseButton={false}>
        <DialogTitle className="sr-only">{t('settings.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('settings.description')}</DialogDescription>
        <div className="flex h-full overflow-hidden">
          {/* Configuration Panel — the only column left, so it fills the dialog. */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b">
              <div className="flex items-center gap-3">{getHeaderContent()}</div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5">
              {selectedProvider && (
                <ProviderConfigPanel
                  provider={selectedProvider}
                  initialApiKey={providersConfig[providerId]?.apiKey || ''}
                  initialBaseUrl={providersConfig[providerId]?.baseUrl || ''}
                  initialRequiresApiKey={providersConfig[providerId]?.requiresApiKey ?? true}
                  providersConfig={providersConfig}
                  onConfigChange={(apiKey, baseUrl, requiresApiKey) =>
                    handleProviderConfigChange(providerId, apiKey, baseUrl, requiresApiKey)
                  }
                  onSave={handleProviderConfigSave}
                  onEditModel={(index) => handleEditModel(providerId, index)}
                  onDeleteModel={(index) => handleDeleteModel(providerId, index)}
                  onAddModel={handleAddModel}
                  onResetToDefault={() => handleResetProvider(providerId)}
                  isBuiltIn={providersConfig[providerId]?.isBuiltIn ?? true}
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t bg-muted/30">
              {saveStatus === 'saved' && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{t('settings.saveSuccess')}</span>
                </div>
              )}
              {saveStatus === 'error' && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <XCircle className="h-4 w-4" />
                  <span>{t('settings.saveFailed')}</span>
                </div>
              )}
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                {t('settings.close')}
              </Button>
              <Button size="sm" onClick={handleSave}>
                {t('settings.save')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>

      {/* Edit Model Dialog */}
      <ModelEditDialog
        open={showModelDialog}
        onOpenChange={setShowModelDialog}
        editingModel={editingModel}
        setEditingModel={setEditingModel}
        onSave={handleSaveModel}
        onAutoSave={handleAutoSaveModel}
        providerId={providerId}
        apiKey={providersConfig[providerId]?.apiKey || ''}
        baseUrl={providersConfig[providerId]?.baseUrl}
        providerType={providersConfig[providerId]?.type}
        requiresApiKey={providersConfig[providerId]?.requiresApiKey}
        isServerConfigured={providersConfig[providerId]?.isServerConfigured}
      />
    </Dialog>
  );
}
