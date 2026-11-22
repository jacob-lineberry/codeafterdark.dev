+++
# DESIGN FIXTURE: synthetic content for checking the layout. Draft only; never publish.
draft = true
date = '2026-11-15T21:05:00-05:00'
title = 'jq can read Terraform plans if you ask it nicely'
description = 'One line that turns a plan into a list of resources that will be destroyed.'
tags = ['terraform', 'jq']
+++

> [!NOTE] Design fixture
> Synthetic sample post used to check the site's design.

Before approving a plan, I want to see exactly what gets destroyed. `terraform show -json` plus one `jq` filter does it:

```bash
terraform show -json plan.out \
  | jq -r '.resource_changes[] | select(.change.actions | index("delete")) | .address'
```

That's the whole trick.
