import type { Icon } from 'phosphor-react-native';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';

export type SuggestionId = 'summarize' | 'photo' | 'brainstorm';

export type Suggestion = {
  id: SuggestionId;
  title: string;
  description: string;
  icon: Icon;
  /** Text put into the composer when the tile is tapped. */
  prefill?: string;
};

// Starter suggestions for a new chat. The final words come from the product team.
const ALL_SUGGESTIONS: Suggestion[] = [
  {
    id: 'summarize',
    title: 'Summarize a document',
    description: 'Get the key points of any file.',
    icon: FileTextIcon,
    prefill: 'Summarize this document.',
  },
  {
    id: 'photo',
    title: 'Ask about a photo',
    description: 'Add a picture and ask anything.',
    icon: CameraIcon,
  },
  {
    id: 'brainstorm',
    title: 'Brainstorm ideas',
    description: 'Names, plans and fresh angles.',
    icon: LightningIcon,
    prefill: 'Help me brainstorm ',
  },
];

/** The tiles to show. Without pictures, the document and photo tiles go. */
export function suggestionsFor({ pictures }: { pictures: boolean }) {
  return pictures
    ? ALL_SUGGESTIONS
    : ALL_SUGGESTIONS.filter((suggestion) => suggestion.id === 'brainstorm');
}
