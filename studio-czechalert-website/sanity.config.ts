import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schemaTypes'
import {documentInternationalization} from "@sanity/document-internationalization"
import {assist} from "@sanity/assist"


export default defineConfig({
  name: 'default',
  title: 'CzechAlert Website',

  projectId: '8z0tbe2a',
  dataset: 'production',

  plugins: [
    structureTool(), 
    visionTool(),
    documentInternationalization({
      supportedLanguages: [
        { id: "en", title: "English" },
        { id: "cs", title: "Čeština" },
      ],
      schemaTypes: ["post"],
    }),
    assist ({
      translate: {
        document: {languageField: "language"},
      }
    })
  ],

  schema: {
    types: schemaTypes,
  },
})
