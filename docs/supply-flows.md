# Supply Flow Diagrams

These diagrams describe how supplies move between the new production sites, storage points, and service locations.

## Food Supply Flow

```mermaid
graph TD
  Farm[Pumpkin & Carrot Farm] --> Produce[Produce Stock (Market Square)]
  Produce --> Market[Market Square]
  Market --> Bakery[Sunrise Bakery]
  Market --> Restaurant[Golden Spoon Restaurant]
  Market --> Picnic[Sunny Picnic Grove]
```

## Drink Supply Flow

```mermaid
graph TD
  Creek[Crystal Creek] --> Market[Market Square Ingredients]
  LemonOrchard[Lemon Orchard] --> Market
  Sugar[Sugar Cane Field] --> Market
  Honey[Honeybee Field] --> Market
  Market --> Lemonade[Lemonade Bar]
  Market --> MilkHoney[Milk & Honey Well]
```

Notes:
- Lemonade uses sugar or honey as the sweetener.
- Crystal Creek refills the water ingredient for the market.
- Market Square is the drink ingredient hub and drink supply source (replacing the water tower).

## Milk & Honey Fountain Flow

```mermaid
graph TD
  Milk[Cow Pasture] --> Market[Market Square Ingredients]
  Honey[Honeybee Field] --> Market
  Market --> MilkHoney[Milk & Honey Well]
```

## Repair Supply Flow

```mermaid
graph TD
  Forest[Whispering Forest] --> Lumberyard[Lumberyard]
  Lumberyard --> Houses[Pony Houses]
```
