// Type augmentation so `i18n` is accepted on document schemas when using @sanity/document-internationalization
import type {DocumentDefinition} from 'sanity'

declare module 'sanity' {
  // Allow i18n config flag on documents
  interface DocumentDefinition {
    i18n?: boolean | Record<string, unknown>
  }
}
