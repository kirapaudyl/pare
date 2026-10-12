import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useBrainStore } from './useBrainStore';

export type FeaturedStyle = 'tiles' | 'list';
export interface FeaturedEntry {
  domainId: string;
  style: FeaturedStyle;
}

interface SettingsState {
  loaded: boolean;
  featured: FeaturedEntry[];
  forexTarget: number | null;
  load: () => Promise<void>;
  setFeatured: (next: FeaturedEntry[]) => void;
  setForexTarget: (n: number | null) => void;
}

let loading = false;

export const useSettingsStore = create<SettingsState>()((set, get) => {
  const save = async () => {
    const userId = useBrainStore.getState().userId;
    if (!userId) return;
    const { featured, forexTarget } = get();
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: userId, featured, forex_target: forexTarget, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) useBrainStore.setState({ syncError: `Couldn't save settings (${error.message}). Did you run supabase/schema_v2.sql?` });
  };

  return {
    loaded: false,
    featured: [],
    forexTarget: null,

    load: async () => {
      if (get().loaded || loading || !useBrainStore.getState().userId) return;
      loading = true;
      const { data, error } = await supabase.from('user_settings').select('featured,forex_target').maybeSingle();
      loading = false;
      if (error) {
        useBrainStore.setState({ syncError: `Couldn't load settings (${error.message}). Did you run supabase/schema_v2.sql?` });
        return;
      }
      set({
        loaded: true,
        featured: Array.isArray(data?.featured) ? (data!.featured as FeaturedEntry[]) : [],
        forexTarget: data?.forex_target != null ? Number(data.forex_target) : null,
      });
    },

    setFeatured: (featured) => { set({ featured }); void save(); },
    setForexTarget: (forexTarget) => { set({ forexTarget }); void save(); },
  };
});
