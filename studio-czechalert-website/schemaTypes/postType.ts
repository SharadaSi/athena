

import {defineField, defineType, defineArrayMember} from 'sanity'

export const postType = defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
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
      name: 'image',
      type: 'image',
      options: { hotspot: true },
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
      of: [{type: 'block'}],
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
        defineArrayMember({
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
        })
      ]
    })
  ],
})