# Supply Flow Diagrams

These diagrams describe how supplies move between the new production sites, storage points, and service locations.

## Food Supply Flow

```mermaid
graph TD
  Farm[Pumpkin & Carrot Farm] --> Market[Market Square]
  Market --> Bakery[Sunrise Bakery]
  Market --> Restaurant[Golden Spoon Restaurant]
  Market --> Picnic[Sunny Picnic Grove]
```

## Drink Supply Flow

```mermaid
graph TD
  Water[Water Tower] --> Lemonade[Lemonade Bar]
  LemonOrchard[Lemon Orchard / Cow Pasture] --> Lemonade
  Sugar[Sugar Cane Field] --> Lemonade
  Honey[Honeybee Field] --> Lemonade
```

Note: Lemonade uses sugar or honey as the sweetener.

## Milk & Honey Fountain Flow

```mermaid
graph TD
  Milk[Cow Pasture] --> MilkHoney[Milk & Honey Well]
  Honey[Honeybee Field] --> MilkHoney
```

## Repair Supply Flow

```mermaid
graph TD
  Forest[Whispering Forest] --> Lumberyard[Lumberyard]
  Lumberyard --> Houses[Pony Houses]
```
