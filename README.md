## gql-inspector

Run GraphQL inspector

<img width="799" alt="Screen Shot 2021-06-30 at 6 21 31 PM" src="https://user-images.githubusercontent.com/17484350/124038955-05489580-d9d0-11eb-8b5b-840fc68099c9.png">


## Usage

```yaml
...
    steps:
      - uses: actions/checkout@v2
      - name: Run GraphQL inspector
        uses: tj-actions/gql-inspector@v1
        with:
          schema: 'main:schema.graphql'
```

*   Free software: [MIT license](LICENSE)

If you feel generous and want to show some extra appreciation:

[![Buy me a coffee][buymeacoffee-shield]][buymeacoffee]

[buymeacoffee]: https://www.buymeacoffee.com/jackton1

[buymeacoffee-shield]: https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png
