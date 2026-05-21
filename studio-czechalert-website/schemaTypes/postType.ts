

import {defineArrayMember, defineField, defineType} from 'sanity'
import {ChartHeightInput} from '../components/ChartHeightInput'

export const postType = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  i18n: true,
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'previewHeading',
      title: 'Preview Heading',
      type: 'string',
      description: 'Short attention-catching heading for previews (Publications, Homepage). Falls back to Title if empty.'
    }),
    defineField({
      name: 'slug',
      type: 'slug',
      options: {source: 'title'},
      validation: (rule) => rule.required(), 
    }),
    defineField({
      name: 'meta',
      title: 'Meta description',
      type: 'string',
      description: 'Short description of a page, shown in SERP. 150 - 160 characters.'
    }),
    // Managed by @sanity/document-internationalization plugin
    defineField({
      name: 'language',
      type: 'string',
      readOnly: true,
      hidden: true,
    }),
    // Manual translation linking - prevents deletion issues with weak: true
    defineField({
      name: 'translationOf',
      title: 'Translation Of',
      type: 'reference',
      to: [{type: 'post'}],
      description: 'Link to the post in another language. Always link BOTH directions (EN ↔ CS).',
      weak: true,
    }),
    defineField({
      name: 'image',
      type: 'image',
      options: { hotspot: true },
      fields: [
        defineField({
        name: 'alt',
        type: 'string',
        description: 'Alternative image description, that helps SEO. Max 125 characters',
        }),
      ]
    }),
    
    defineField({
      name: 'perex',
      title: 'Perex (Intro Paragraph)',
      type: 'text',
      description: 'Intro paragraph shown as the first paragraph on the article page and used as preview excerpt.'
    }),
    defineField({
      name: 'body',
      type: 'array',
      // Using defineArrayMember registers each entry as a first-class Portable Text
      // block. The PT editor automatically renders a drag handle for non-text blocks
      // (like chartEmbed), so editors can drag-and-drop charts between paragraphs.
      of: [
        defineArrayMember({type: 'block'}),
        defineArrayMember({
          type: 'object',
          name: 'chartEmbed',
          title: 'Chart / Diagram',
          fields: [
            defineField({
              name: 'file',
              title: 'HTML file',
              type: 'file',
              description:
                'Self-contained .html file (inline all CSS/JS or use absolute CDN URLs). Loaded inside a sandboxed iframe.',
              options: {accept: 'text/html,.html'},
              validation: (rule) => rule.required(),
            }),
            defineField({
              name: 'height',
              title: 'Height (px)',
              type: 'number',
              initialValue: 500,
              description:
                'Auto-measured from the uploaded HTML file when it changes. Override manually if needed.',
              validation: (rule) => rule.min(100).max(4000),
              components: {input: ChartHeightInput},
            }),
            defineField({
              name: 'caption',
              title: 'Caption',
              type: 'string',
              description: 'Optional caption shown below the chart.',
            }),
            defineField({
              name: 'description',
              title: 'Accessible description',
              type: 'string',
              description: 'Used as iframe title / aria-label for screen readers.',
            }),
            defineField({
              name: 'allowFullscreen',
              title: 'Allow fullscreen',
              type: 'boolean',
              initialValue: false,
            }),
          ],
          preview: {
            select: {title: 'caption', filename: 'file.asset.originalFilename'},
            prepare({title, filename}) {
              return {
                title: title || 'Embedded chart',
                subtitle: filename || 'HTML iframe',
              }
            },
          },
        }),
      ],
    }),
    defineField({
      name: 'publishedAt',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      validation: (rule) => rule.required(),
    }),
    defineField({
        name: "author", 
        type: "string",
        validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'readTime',
      title: 'Read Time',
      type: 'string',
      description: 'e.g., "5 min read"'
    }),
    defineField({
      name: 'resources',
      title: 'Resources',
      type: 'array',
      description: 'Numbered list of resources with hyperlinks',
      of: [
        {
          type: 'object',
          name: 'resource',
          fields: [
            defineField({
              name: 'label',
              title: 'Label',
              type: 'string',
              description: 'Optional display text for the resource (defaults to URL)'
            }),
            defineField({
              name: 'url',
              title: 'URL',
              type: 'url',
              validation: (rule) => rule.uri({scheme: ['http', 'https']}).required()
            })
          ]
        }
      ]
    })
  ],
})