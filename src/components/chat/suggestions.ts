import type { Icon } from 'phosphor-react-native';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { ImageSquareIcon } from 'phosphor-react-native/src/icons/ImageSquare';
import { LightningIcon } from 'phosphor-react-native/src/icons/Lightning';

export type SuggestionId = 'summarize' | 'image' | 'photo' | 'brainstorm';

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
    id: 'image',
    title: 'Create an image',
    description: "Describe it and I'll make it.",
    icon: ImageSquareIcon,
    prefill: 'Create an image of ',
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

/** The tiles to show. "Create an image" only appears when the backend can make images. */
export function suggestionsFor(imageGeneration: boolean) {
  return ALL_SUGGESTIONS.filter((suggestion) => suggestion.id !== 'image' || imageGeneration);
}
