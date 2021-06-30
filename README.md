## gql-inspector

Run GraphQL inspector

## Usage

```yaml
...
    steps:
      - uses: actions/checkout@v2
      - name: Run GraphQL inspector
        uses: tj-actions/gql-inspector@v1
        with:
          schema: 'main:schema.graphql'
          fail-on-breaking: false
```

*   Free software: [MIT license](LICENSE)

If you feel generous and want to show some extra appreciation:

[![Buy me a coffee][buymeacoffee-shield]][buymeacoffee]

[buymeacoffee]: https://www.buymeacoffee.com/jackton1

[buymeacoffee-shield]: https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png
