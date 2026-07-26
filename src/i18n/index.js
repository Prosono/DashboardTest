import enMessages from './en.json';
import nnMessages from './nn.json';
import nbMessages from './nb.json';

export const en = enMessages;
export const nb = nbMessages;
export const nn = {
  ...nbMessages,
  ...nnMessages,
};
